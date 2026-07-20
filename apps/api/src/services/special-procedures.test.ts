import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { SpecialProcedureService } from "./special-procedures.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";
const TRUCK = "veh:silverado-2500hd-2003";

describe("SpecialProcedureService", () => {
  const store = createMemoryStore();
  const vehicles = new VehicleService(store);
  const procedures = new SpecialProcedureService(vehicles);

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("returns Proxi for the Jeep and nothing for the Silverado", async () => {
    const jeep = await procedures.forVehicle(JEEP);
    expect(jeep.map((p) => p.id)).toEqual(["proc:fca-proxi-alignment"]);
    expect(await procedures.forVehicle(TRUCK)).toEqual([]);
  });
});
