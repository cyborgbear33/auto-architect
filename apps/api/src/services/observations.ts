import type { ObservationBatchInput } from "@auto/validation";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";

/** Ingests validated Observation batches from obd-gateway (or manual entry). Never realizes/solves itself. */
export class ObservationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async record(input: ObservationBatchInput): Promise<void> {
    await this.vehicles.getOrThrow(input.vehicleId); // 404s early on an unknown vehicle
    await this.store.observations.record(input);
    if (input.odometerMiles !== undefined) {
      await this.vehicles.update(input.vehicleId, { odometerMiles: input.odometerMiles });
    }
  }

  async latestDtcs(vehicleId: string) {
    return this.store.observations.latestDtcs(vehicleId);
  }

  async latestFreezeFrames(vehicleId: string) {
    return this.store.observations.latestFreezeFrames(vehicleId);
  }

  async latestMode06(vehicleId: string) {
    return this.store.observations.latestMode06(vehicleId);
  }
}
