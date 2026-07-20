import { draftForClass } from "@auto/cartridges";
import type { CandidateAction, DiagnosticProblem, Recommendation } from "@auto/semantic-types";
import { conflict, notFound, validationError } from "../lib/errors.ts";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { ActionService } from "./actions.ts";
import { applyCalibration, calibratePlaybook } from "./calibration.ts";
import type { RecognitionService } from "./recognition.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

/** Statuses that still occupy the shortlist (block duplicate refresh for a class). */
const OPEN_STATUSES: ReadonlySet<Recommendation["status"]> = new Set(["new", "viewed", "accepted"]);

const ACTIVE_PROBLEM: ReadonlySet<string> = new Set(["open", "analyzing", "verifying"]);

/**
 * Turns "what classes does this vehicle provably belong to right now" into
 * the Recommendation cards the UI shows on the dashboard — one per
 * most-specific fault class a cartridge knows how to frame. Idempotent per
 * (vehicle, class): re-running never duplicates an already-open recommendation
 * for the same class.
 *
 * Confidence/priority can be adjusted from solution-history outcomes
 * (shrink toward cartridge priors); classes still come only from realize.
 * Cost/risk are compose-only rollups from the top playbook action (R2).
 */
export class RecommendationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private solutionHistory: SolutionHistoryService,
    private actions: ActionService,
  ) {}

  async refresh(vehicleId: string): Promise<Recommendation[]> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const cartridges = this.vehicles.cartridgesFor(vehicle);
    const recognition = await this.recognition.recognize(vehicleId);

    const existing = await this.store.recommendations.listByVehicle(vehicleId);
    const openClasses = new Set(
      existing.filter((r) => OPEN_STATUSES.has(r.status)).flatMap((r) => r.generatedFromClasses),
    );
    // Also skip classes that already have an active diagnostic case (P3).
    for (const p of await this.store.problems.listByVehicle(vehicleId)) {
      if (p.triggeredByClass && ACTIVE_PROBLEM.has(p.status)) {
        openClasses.add(p.triggeredByClass);
      }
    }

    const vehicleView = {
      vehicleId,
      label: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      engineFamily: vehicle.engineFamily,
      dtcs: await this.store.observations.latestDtcs(vehicleId),
      pids: await this.store.observations.latestPids(vehicleId),
    };

    const created: Recommendation[] = [];
    for (const className of recognition.mostSpecific) {
      if (openClasses.has(className)) continue;
      const draft = draftForClass(vehicleView, className, cartridges);
      if (!draft) continue; // a raw Symptom/Condition, not a framed fault syndrome
      const history = await this.solutionHistory.forVehicle(vehicleId, className);
      const calibration = calibratePlaybook({
        faultClass: className,
        actions: draft.actions,
        history,
        urgency: draft.statement.urgency,
      });
      const calibratedActions = applyCalibration(draft.actions, calibration);
      const richness = playbookCostRisk(calibratedActions);
      const reasonBase = draft.statement.whyItMatters ?? draft.statement.gap;
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: draft.label,
        priority: calibration.priority,
        status: "new",
        reason: calibration.explain ? `${reasonBase} (${calibration.explain})` : reasonBase,
        confidence: calibration.recommendationConfidence,
        ...richness,
        generatedFromClasses: [className],
        createdAt: nowIso(),
      };
      await this.store.recommendations.create(rec);
      created.push(rec);
    }
    return [...existing, ...created];
  }

  async list(vehicleId: string): Promise<Recommendation[]> {
    return this.store.recommendations.listByVehicle(vehicleId);
  }

  /** Open shortlist only (`new` / `viewed` / `accepted`). */
  async listOpen(vehicleId: string): Promise<Recommendation[]> {
    const all = await this.list(vehicleId);
    return all.filter((r) => OPEN_STATUSES.has(r.status));
  }

  async markStatus(id: string, status: Recommendation["status"]): Promise<Recommendation> {
    const existing = await this.store.recommendations.get(id);
    if (!existing) throw notFound("Recommendation", id);
    if (existing.status === "converted_to_repair" && status !== "converted_to_repair") {
      throw conflict("Converted recommendations cannot change status — reopen via the case.");
    }
    return this.store.recommendations.update(id, { status });
  }

  /**
   * Convert a recommendation into a diagnostic case via ActionService, then
   * mark the card converted and link `generatedByProblem`. Reuses an active
   * case for the same class when one already exists (P3).
   */
  async convertToRepair(id: string): Promise<{
    recommendation: Recommendation;
    problem: DiagnosticProblem;
  }> {
    const rec = await this.store.recommendations.get(id);
    if (!rec) throw notFound("Recommendation", id);
    if (rec.status === "dismissed" || rec.status === "rejected" || rec.status === "expired") {
      throw conflict(`Cannot convert a "${rec.status}" recommendation.`);
    }
    if (rec.status === "converted_to_repair" && rec.generatedByProblem) {
      const problem = await this.actions.getDiagnosticProblem(rec.generatedByProblem);
      return { recommendation: rec, problem };
    }

    const className = rec.generatedFromClasses[0];
    if (!className) {
      throw validationError("Recommendation has no generatedFromClasses to convert.");
    }

    const problems = await this.store.problems.listByVehicle(rec.vehicleId);
    const existingCase = problems.find(
      (p) => p.triggeredByClass === className && ACTIVE_PROBLEM.has(p.status),
    );
    const problem =
      existingCase ??
      (await this.actions.createDiagnosticProblem({
        vehicleId: rec.vehicleId,
        triggeredByClass: className,
        statement: { currentState: "", desiredState: "", gap: "" },
        actions: [],
      }));

    const recommendation = await this.store.recommendations.update(id, {
      status: "converted_to_repair",
      generatedByProblem: problem.id,
    });
    return { recommendation, problem };
  }
}

/**
 * Card-level cost/risk from the highest-confidence playbook action.
 * Pure helper — exported for unit tests.
 */
export function playbookCostRisk(actions: CandidateAction[]): {
  cost?: number;
  risk?: number;
  suggestedActionId?: string;
} {
  if (actions.length === 0) return {};
  const ranked = [...actions].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const top = ranked[0]!;
  return {
    ...(top.cost !== undefined ? { cost: top.cost } : {}),
    ...(top.risk !== undefined ? { risk: top.risk } : {}),
    suggestedActionId: top.id,
  };
}
