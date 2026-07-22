import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("VehicleService.patchIdentity", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("records VIN and odometer without inventing them", async () => {
    const before = await services.vehicles.getOrThrow(JEEP);
    expect(before.vin).toBeUndefined();

    const updated = await services.vehicles.patchIdentity(JEEP, {
      vin: "1C4NJDEB0FD123456",
      odometerMiles: 98400,
    });
    expect(updated.vin).toBe("1C4NJDEB0FD123456");
    expect(updated.odometerMiles).toBe(98400);
  });

  it("clears identity fields when null is sent", async () => {
    await services.vehicles.patchIdentity(JEEP, {
      vin: "1C4NJDEB0FD123456",
      odometerMiles: 1000,
    });
    const cleared = await services.vehicles.patchIdentity(JEEP, {
      vin: null,
      odometerMiles: null,
    });
    expect(cleared.vin).toBeUndefined();
    expect(cleared.odometerMiles).toBeUndefined();
  });
});
