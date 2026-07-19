import { runPerception } from "@auto/cartridges";
import type { LogosBridge } from "@auto/logos-bridge";
import { dlOntology } from "@auto/ontology";
import type { Recognition } from "@auto/semantic-types";
import { mapBridgeError } from "../lib/bridge-errors.ts";
import type { Store } from "../store/index.ts";
import type { ForecastService } from "./forecast.ts";
import type { VehicleService } from "./vehicle.ts";

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
    const abox = runPerception(vehicleId, dtcs, pids, cartridges);

    // Trend evidence (ChronicOilConsumption) comes from `forecast` over a
    // logged series, not an instantaneous PID threshold — fold it into the
    // ABox as its own Trend individual before realizing.
    const oilTrend = await this.forecast.oilLevelTrend(vehicleId);
    if (oilTrend.declining) {
      const trendId = `${vehicleId}:oil-level-decline`;
      abox.concepts[trendId] = ["OilLevelDecline"];
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
      return {
        individual: result.individual,
        member: result.member,
        mostSpecific: result.mostSpecific,
        undecided: result.undecided,
      };
    } catch (err) {
      throw mapBridgeError(err);
    }
  }
}
