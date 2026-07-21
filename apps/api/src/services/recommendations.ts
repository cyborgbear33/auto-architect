import { draftForClass } from "@auto/cartridges";
import { listSpecialProcedures } from "@auto/ontology";
import type { CandidateAction, DiagnosticProblem, Recommendation } from "@auto/semantic-types";
import { conflict, notFound, validationError } from "../lib/errors.ts";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { ActionService } from "./actions.ts";
import { applyCalibration, calibratePlaybook } from "./calibration.ts";
import type { CampaignService } from "./campaigns.ts";
import type { RecognitionService } from "./recognition.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

/** Statuses that still occupy the shortlist (block duplicate refresh). */
const OPEN_STATUSES: ReadonlySet<Recommendation["status"]> = new Set(["new", "viewed", "accepted"]);

const ACTIVE_PROBLEM: ReadonlySet<string> = new Set(["open", "analyzing", "verifying"]);

/**
 * Turns proven fault classes (and matched campaigns/TSBs) into Dashboard
 * shortlist cards. Class cards never invent realize membership; campaign cards
 * cite OEM ids with empty `generatedFromClasses` (R5).
 */
export class RecommendationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private solutionHistory: SolutionHistoryService,
    private actions: ActionService,
    private campaigns: CampaignService,
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
    const openCampaignIds = new Set(
      existing
        .filter((r) => OPEN_STATUSES.has(r.status))
        .flatMap((r) => r.generatedFromCampaignIds ?? []),
    );
    const openProcedureIds = new Set(
      existing
        .filter((r) => OPEN_STATUSES.has(r.status))
        .flatMap((r) => r.generatedFromProcedureIds ?? []),
    );

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
        reason: reasonBase,
        ...(calibration.explain ? { calibrationExplain: calibration.explain } : {}),
        confidence: calibration.recommendationConfidence,
        ...richness,
        source: "class",
        generatedFromClasses: [className],
        createdAt: nowIso(),
      };
      await this.store.recommendations.create(rec);
      created.push(rec);
      openClasses.add(className);
    }

    // R5: applicability cards from matched campaigns / TSBs (not proven classes).
    const pack = await this.campaigns.forVehicle(vehicleId);
    const yearBit =
      vehicle.year !== undefined && vehicle.year !== null ? `year ${vehicle.year}` : "year unknown";
    for (const c of pack.campaigns) {
      if (openCampaignIds.has(c.id)) continue;
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: `${c.id}: ${c.title}`,
        priority: "high",
        status: "new",
        reason: [
          c.summary,
          `Matched ${vehicle.engineFamily} (${yearBit}; campaign years ${c.yearRange[0]}–${c.yearRange[1]}).`,
          c.reference ? `Ref: ${c.reference}` : null,
          "Applicability only — not a proven fault class.",
        ]
          .filter(Boolean)
          .join(" "),
        source: "campaign",
        generatedFromClasses: [],
        generatedFromCampaignIds: [c.id],
        createdAt: nowIso(),
      };
      await this.store.recommendations.create(rec);
      created.push(rec);
      openCampaignIds.add(c.id);
    }
    for (const t of pack.tsbs) {
      if (openCampaignIds.has(t.id)) continue;
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: `${t.id}: ${t.title}`,
        priority: "normal",
        status: "new",
        reason: [
          t.summary,
          `Matched TSB for ${vehicle.engineFamily}.`,
          t.reference ? `Ref: ${t.reference}` : null,
          "Applicability only — not a proven fault class.",
        ]
          .filter(Boolean)
          .join(" "),
        source: "campaign",
        generatedFromClasses: [],
        generatedFromCampaignIds: [t.id],
        createdAt: nowIso(),
      };
      await this.store.recommendations.create(rec);
      created.push(rec);
      openCampaignIds.add(t.id);
    }

    // Guided special procedures (e.g. Proxi) — applicability only; open Functions to run.
    for (const proc of listSpecialProcedures(vehicle.engineFamily)) {
      if (openProcedureIds.has(proc.id)) continue;
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: proc.title,
        priority: "high",
        status: "new",
        reason: [
          proc.summary.slice(0, 320),
          "Open Functions to run the guided checklist. Execution uses AlfaOBD/wiTECH + OBDLink MX+ (gray adapter when prompted) — not the standard OBD gateway.",
          "Applicability / operator context only — not a proven fault class from Mode 01–07.",
        ].join(" "),
        source: "procedure",
        generatedFromClasses: [],
        generatedFromProcedureIds: [proc.id],
        createdAt: nowIso(),
      };
      await this.store.recommendations.create(rec);
      created.push(rec);
      openProcedureIds.add(proc.id);
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
   * mark the card converted and link `generatedByProblem`.
   * Class cards reuse an active case for the same class (P3).
   * Campaign cards open a manual case (no triggeredByClass — never invent a class).
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

    const isCampaign = rec.source === "campaign" || (rec.generatedFromCampaignIds?.length ?? 0) > 0;
    const isProcedure =
      rec.source === "procedure" || (rec.generatedFromProcedureIds?.length ?? 0) > 0;
    const className = rec.generatedFromClasses[0];

    let problem: DiagnosticProblem;
    if (isProcedure) {
      const procedureId = rec.generatedFromProcedureIds?.[0];
      if (!procedureId) {
        throw validationError("Procedure recommendation missing generatedFromProcedureIds.");
      }
      const started = await this.actions.startSpecialProcedure({
        vehicleId: rec.vehicleId,
        procedureId,
        decidedBy: "operator",
        note: "Converted from Functions recommendation card",
      });
      problem = started.problem;
    } else if (isCampaign) {
      const campaignId = rec.generatedFromCampaignIds?.[0] ?? "campaign";
      problem = await this.actions.createDiagnosticProblem({
        vehicleId: rec.vehicleId,
        statement: {
          currentState: `OEM campaign / TSB ${campaignId} applies to this vehicle`,
          desiredState: `Dealer procedure for ${campaignId} completed or ruled out`,
          gap: rec.reason.slice(0, 280),
          whyItMatters: rec.title,
          urgency: rec.priority === "high" || rec.priority === "critical" ? "high" : "medium",
        },
        actions: [],
      });
    } else {
      if (!className) {
        throw validationError("Recommendation has no generatedFromClasses to convert.");
      }
      const problems = await this.store.problems.listByVehicle(rec.vehicleId);
      const existingCase = problems.find(
        (p) => p.triggeredByClass === className && ACTIVE_PROBLEM.has(p.status),
      );
      problem =
        existingCase ??
        (await this.actions.createDiagnosticProblem({
          vehicleId: rec.vehicleId,
          triggeredByClass: className,
          statement: { currentState: "", desiredState: "", gap: "" },
          actions: [],
        }));
    }

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
