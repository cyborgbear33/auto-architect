import { composeAllClassEvidence, runPerception } from "@auto/cartridges";
import type { LogosBridge } from "@auto/logos-bridge";
import { dlOntology } from "@auto/ontology";
import type { ClassNarration, Recognition } from "@auto/semantic-types";
import { mapBridgeError } from "../lib/bridge-errors.ts";
import type { Store } from "../store/index.ts";
import type { ForecastService } from "./forecast.ts";
import type { VehicleService } from "./vehicle.ts";

function ontologyNotes(): Record<string, string> {
  const notes = (dlOntology as { notes?: Record<string, string> }).notes;
  return notes ?? {};
}

/**
 * Structural recognition: turns a vehicle's latest OBD-II evidence into DL
 * ABox assertions and asks LOGOS which fault classes it provably belongs to.
 * This is how the agent *perceives* — the decision of what a vehicle's state
 * "is" lives in the DL ontology and the reasoner, never in a hardcoded
 * `if (dtc === "P0304")` in application code.
 *
 * Deliberately does NOT synthesize a "Healthy" class when nothing is proven
 * (per the plan: "never a synthesized Healthy") — an empty `member` list is
 * the honest "nothing provable from current evidence," which is not the same
 * claim as "the vehicle is fine."
 */
export class RecognitionService {
  constructor(
    private store: Store,
    private bridge: LogosBridge,
    private vehicles: VehicleService,
    private forecast: ForecastService,
  ) {}

  async recognize(vehicleId: string): Promise<Recognition> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const cartridges = this.vehicles.cartridgesFor(vehicle);
    const view = this.vehicles.viewFor(vehicle);

    const dtcs = await this.store.observations.latestDtcs(vehicleId);
    const pids = await this.store.observations.latestPids(vehicleId);
    const freezeFrames = await this.store.observations.latestFreezeFrames(vehicleId);
    const abox = runPerception(vehicleId, dtcs, pids, cartridges);

    // Trend evidence comes from `forecast` over logged series — fold each
    // ontology-backed flag into the ABox before realizing (never invent classes).
    const forecast = await this.forecast.summary(vehicleId);
    for (const signal of forecast.signals) {
      if (!signal.flagged || !signal.ontologyTrend) continue;
      const trendId = `${vehicleId}:${signal.id}-trend`;
      abox.concepts[trendId] = [signal.ontologyTrend];
      abox.roles.push(["hasTrend", vehicleId, trendId]);
    }

    try {
      const result = await this.bridge.realize({
        ontology: dlOntology,
        abox,
        individual: vehicleId,
        view,
        scope: true,
      });
      const narration = await this.narrateClasses(result.mostSpecific);
      const classEvidence = composeAllClassEvidence(
        result.mostSpecific,
        cartridges,
        dtcs,
        pids,
        freezeFrames,
      );
      return {
        individual: result.individual,
        member: result.member,
        mostSpecific: result.mostSpecific,
        undecided: result.undecided,
        narration,
        classEvidence,
      };
    } catch (err) {
      throw mapBridgeError(err);
    }
  }

  /** Prefer LOGOS verbalize; fall back to ontology notes, then the class name. */
  private async narrateClasses(classes: string[]): Promise<ClassNarration[]> {
    const notes = ontologyNotes();
    const out: ClassNarration[] = [];
    for (const className of classes) {
      const note = notes[className];
      try {
        const verbalized = note
          ? await this.bridge.verbalize({ controlledEnglish: note })
          : await this.bridge.verbalize({ formula: className });
        if (verbalized.fluent && !verbalized.error) {
          // Fake echoes input; prefer the richer ontology note when fluent is just the class name.
          if (note && (verbalized.fluent === className || verbalized.fluent === note)) {
            out.push({ className, fluent: note, source: "ontology_note" });
          } else if (verbalized.fluent !== className) {
            out.push({ className, fluent: verbalized.fluent, source: "verbalize" });
          } else if (note) {
            out.push({ className, fluent: note, source: "ontology_note" });
          } else {
            out.push({ className, fluent: className, source: "class_name" });
          }
          continue;
        }
      } catch {
        /* fall through to note / class name */
      }
      if (note) out.push({ className, fluent: note, source: "ontology_note" });
      else out.push({ className, fluent: className, source: "class_name" });
    }
    return out;
  }
}
