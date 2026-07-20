import type { SpecialProcedureEntry } from "@auto/ontology";
import { getSpecialProcedure, listSpecialProcedures } from "@auto/ontology";
import { notFound } from "../lib/errors.ts";
import type { VehicleService } from "./vehicle.ts";

/** Curated OEM special procedures (Proxi, etc.) — read-only catalog for a vehicle. */
export class SpecialProcedureService {
  constructor(private vehicles: VehicleService) {}

  async forVehicle(vehicleId: string): Promise<SpecialProcedureEntry[]> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    return listSpecialProcedures(vehicle.engineFamily);
  }

  async getForVehicle(vehicleId: string, procedureId: string): Promise<SpecialProcedureEntry> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const proc = getSpecialProcedure(procedureId);
    if (!proc || proc.engineFamily !== vehicle.engineFamily) {
      throw notFound("SpecialProcedure", procedureId);
    }
    return proc;
  }
}
