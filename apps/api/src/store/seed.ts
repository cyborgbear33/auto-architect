import { listVehicleProfiles } from "@auto/ontology";
import type { Store } from "./index.ts";

/** Seeds the vehicle-profile registry (packages/ontology/vehicle-profiles.json) into the store. */
export async function seed(store: Store): Promise<void> {
  for (const profile of listVehicleProfiles()) {
    await store.vehicles.create(profile);
  }
}
