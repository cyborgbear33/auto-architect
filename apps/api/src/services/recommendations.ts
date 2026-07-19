import { draftForClass } from "@auto/cartridges";
import type { Recommendation } from "@auto/semantic-types";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { RecognitionService } from "./recognition.ts";
import type { VehicleService } from "./vehicle.ts";

const URGENCY_TO_PRIORITY: Record<string, Recommendation["priority"]> = {
  critical: "critical",
  high: "high",
  medium: "normal",
  low: "low",
};

/**
 * Turns "what classes does this vehicle provably belong to right now" into
 * the Recommendation cards the UI shows on the dashboard — one per
 * most-specific fault class a cartridge knows how to frame. Idempotent per
 * (vehicle, class): re-running never duplicates an already-`new`/`viewed`
 * recommendation for the same class.
 */
export class RecommendationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
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
      const rec: Recommendation = {
        id: newId("rec"),
        vehicleId,
        title: draft.label,
        priority: URGENCY_TO_PRIORITY[draft.statement.urgency ?? "medium"] ?? "normal",
        status: "new",
        reason: draft.statement.whyItMatters ?? draft.statement.gap,
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
