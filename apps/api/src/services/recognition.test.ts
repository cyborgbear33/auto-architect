import { beforeEach, describe, expect, it } from "vitest";
import { FakeLogosBridge, type RealizeInput, type RealizeResult } from "@auto/logos-bridge";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { VehicleService } from "./vehicle.ts";
import { ForecastService } from "./forecast.ts";
import { RecognitionService } from "./recognition.ts";
import type { Store } from "../store/index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

function makeServices(realizer?: (input: RealizeInput) => RealizeResult) {
  const store: Store = createMemoryStore();
  const bridge = realizer
    ? new FakeLogosBridge(undefined, realizer)
    : new FakeLogosBridge();
  const vehicles = new VehicleService(store);
  const forecast = new ForecastService(store, bridge);
  const recognition = new RecognitionService(store, bridge, vehicles, forecast);
  return { store, bridge, vehicles, forecast, recognition };
}

describe("RecognitionService", () => {
  let ctx: ReturnType<typeof makeServices>;

  beforeEach(async () => {
    ctx = makeServices((input) => ({
      individual: input.individual,
      // Echo back whatever the ABox actually asserts a fault syndrome from,
      // so the test can assert perception really reached the bridge call.
      member: Object.values(input.abox.concepts).flat().includes("CylinderMisfire") ? ["MisfireUnderLoad"] : [],
      mostSpecific: Object.values(input.abox.concepts).flat().includes("CylinderMisfire") ? ["MisfireUnderLoad"] : [],
      undecided: [],
    }));
    await seed(ctx.store);
  });

  it("never synthesizes Healthy when nothing is proven", async () => {
    const result = await ctx.recognition.recognize(JEEP);
    expect(result.member).toEqual([]);
    expect(result.mostSpecific).toEqual([]);
  });

  it("recognizes MisfireUnderLoad once a misfire DTC is recorded", async () => {
    await ctx.store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 85, timestamp: "2026-01-01T00:00:00Z" }],
    });
    const result = await ctx.recognition.recognize(JEEP);
    expect(result.member).toContain("MisfireUnderLoad");
  });

  it("404s for an unknown vehicle", async () => {
    await expect(ctx.recognition.recognize("veh:does-not-exist")).rejects.toMatchObject({ statusCode: 404 });
  });
});
