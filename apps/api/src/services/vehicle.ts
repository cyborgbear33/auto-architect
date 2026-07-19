import { allCartridges, type Cartridge, resolveCartridgesForEngineFamily } from "@auto/cartridges";
import { getEngineFamily, getEngineFamilyView, listEngineFamilies } from "@auto/ontology";
import type { EngineFamily, VehicleProfile } from "@auto/semantic-types";
import type { CreateVehicleInput } from "@auto/validation";
import { notFound, validationError } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";

/**
 * The vehicle-profile axis: which engine family a vehicle belongs to, and
 * therefore which cartridges (and DL TBox view) apply to it. This is the
 * service every other diagnostic service asks "what does THIS vehicle mean?"
 * before touching the reasoning engine — the direct analogue of garden's
 * per-call `views.*` scoping, applied per-vehicle instead.
 */
export class VehicleService {
  constructor(private store: Store) {}

  async list(): Promise<VehicleProfile[]> {
    return this.store.vehicles.list();
  }

  async get(id: string): Promise<VehicleProfile | undefined> {
    return this.store.vehicles.get(id);
  }

  async getOrThrow(id: string): Promise<VehicleProfile> {
    const vehicle = await this.get(id);
    if (!vehicle) throw notFound("Vehicle", id);
    return vehicle;
  }

  async update(id: string, patch: Partial<VehicleProfile>): Promise<VehicleProfile> {
    return this.store.vehicles.update(id, patch);
  }

  async create(input: CreateVehicleInput): Promise<VehicleProfile> {
    if (!getEngineFamily(input.engineFamily)) {
      throw validationError(
        `Unknown engineFamily "${input.engineFamily}". Known families: ${listEngineFamilies()
          .map((f) => f.id)
          .join(", ")}. Add it to packages/ontology/vehicle-profiles.json first.`,
      );
    }
    const profile: VehicleProfile = {
      id: newId("veh"),
      ...input,
      year: input.year ?? null,
      trim: input.trim ?? null,
    };
    return this.store.vehicles.create(profile);
  }

  engineFamilyOf(vehicle: VehicleProfile): EngineFamily {
    const family = getEngineFamily(vehicle.engineFamily);
    if (!family)
      throw validationError(
        `Vehicle "${vehicle.id}" references unknown engine family "${vehicle.engineFamily}".`,
      );
    return family;
  }

  /** Cartridges to load for this vehicle, resolved purely from its engine family. */
  cartridgesFor(vehicle: VehicleProfile): Cartridge[] {
    return resolveCartridgesForEngineFamily(vehicle.engineFamily);
  }

  /** The named ontology view (TBox slice) this vehicle's realize/reason calls should use. */
  viewFor(vehicle: VehicleProfile): string {
    return getEngineFamilyView(vehicle.engineFamily);
  }

  listEngineFamilies(): EngineFamily[] {
    return listEngineFamilies();
  }

  listAllCartridgeNames(): string[] {
    return allCartridges.map((c) => c.name);
  }
}
