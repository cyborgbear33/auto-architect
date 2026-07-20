import { draftForClass } from "@auto/cartridges";
import type { Recommendation } from "@auto/semantic-types";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import { calibratePlaybook } from "./calibration.ts";
import type { RecognitionService } from "./recognition.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

/**
 * Turns "what classes does this vehicle provably belong to right now" into
 * the Recommendation cards the UI shows on the dashboard — one per
 * most-specific fault class a cartridge knows how to frame. Idempotent per
 * (vehicle, class): re-running never duplicates an already-`new`/`viewed`
 * recommendation for the same class.
 *
 * Confidence/priority can be adjusted from solution-history outcomes
 * (shrink toward cartridge priors); classes still come only from realize.
 */
export class RecommendationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private solutionHistory: SolutionHistoryService,
  ) {}

  async refresh(vehicleId: string): Promise<Recommendation[]> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const cartridges = this.vehicles.cartridgesFor(vehicle);
    const recognition = await this.recognition.recognize(vehicleId);

    const existing = await this.store.recommendations.listByVehicle(vehicleId);
    const openClasses = new Set(
      existing
        .filter((r) => r.status === "new" || r.status === "viewed")
        .flatMap((r) => r.generatedFromClasses),
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
      const reasonBase = draft.statement.whyItMatters ?? draft.statement.gap;
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: draft.label,
        priority: calibration.priority,
        status: "new",
        reason: calibration.explain ? `${reasonBase} (${calibration.explain})` : reasonBase,
        confidence: calibration.recommendationConfidence,
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

  async markStatus(id: string, status: Recommendation["status"]): Promise<Recommendation> {
    return this.store.recommendations.update(id, { status });
  }
}
