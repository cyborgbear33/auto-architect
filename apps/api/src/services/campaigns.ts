import { campaignsForEngineFamily, tsbsForEngineFamily, type TsbEntry } from "@auto/ontology";
import type { KnownCampaign } from "@auto/semantic-types";
import type { VehicleService } from "./vehicle.ts";

/** Recall/TSB matcher: VIN's engine family + model year vs. known manufacturer campaigns. */
export class CampaignService {
  constructor(private vehicles: VehicleService) {}

  async forVehicle(vehicleId: string): Promise<{ campaigns: KnownCampaign[]; tsbs: TsbEntry[] }> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    return {
      campaigns: campaignsForEngineFamily(vehicle.engineFamily, vehicle.year),
      tsbs: tsbsForEngineFamily(vehicle.engineFamily),
    };
  }
}
