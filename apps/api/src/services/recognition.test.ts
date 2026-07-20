import { FakeLogosBridge, type RealizeInput, type RealizeResult } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import type { Store } from "../store/index.ts";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { ForecastService } from "./forecast.ts";
import { RecognitionService } from "./recognition.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

function makeServices(realizer?: (input: RealizeInput) => RealizeResult) {
  const store: Store = createMemoryStore();
  const bridge = realizer ? new FakeLogosBridge(undefined, realizer) : new FakeLogosBridge();
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
      member: Object.values(input.abox.concepts).flat().includes("CylinderMisfire")
        ? ["MisfireUnderLoad"]
        : [],
      mostSpecific: Object.values(input.abox.concepts).flat().includes("CylinderMisfire")
        ? ["MisfireUnderLoad"]
        : [],
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
      freezeFrames: [
        {
          dtc: "P0304",
          readings: [
            { pid: "ENGINE_LOAD", value: 85, unit: "%", timestamp: "2026-01-01T00:00:00Z" },
          ],
        },
      ],
    });
    const result = await ctx.recognition.recognize(JEEP);
    expect(result.member).toContain("MisfireUnderLoad");
    const evidence = result.classEvidence?.find((e) => e.className === "MisfireUnderLoad");
    expect(evidence?.dtcs.map((d) => d.code)).toContain("P0304");
    expect(evidence?.pids.some((p) => p.pid === "ENGINE_LOAD" && p.thresholdMet)).toBe(true);
    expect(evidence?.freezeFrames[0]?.dtc).toBe("P0304");
  });

  it("404s for an unknown vehicle", async () => {
    await expect(ctx.recognition.recognize("veh:does-not-exist")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("folds failed Mode 06 catalyst monitor into the ABox before realize", async () => {
    let sawFailedCat = false;
    const realizer = (input: RealizeInput): RealizeResult => {
      sawFailedCat = Object.values(input.abox.concepts)
        .flat()
        .includes("FailedCatalystMonitorBank1");
      return {
        individual: input.individual,
        member: sawFailedCat ? ["CatalystEfficiencyBank1"] : [],
        mostSpecific: sawFailedCat ? ["CatalystEfficiencyBank1"] : [],
        undecided: [],
      };
    };
    const store = createMemoryStore();
    await seed(store);
    const customBridge = new FakeLogosBridge(undefined, realizer);
    const vehicles = new VehicleService(store);
    const forecast = new ForecastService(store, customBridge);
    const recognition = new RecognitionService(store, customBridge, vehicles, forecast);

    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      mode06: [{ tid: "01", mid: "21", value: 0.8, min: 0, max: 0.5, passed: false }],
    });

    const result = await recognition.recognize(JEEP);
    expect(sawFailedCat).toBe(true);
    expect(result.mostSpecific).toContain("CatalystEfficiencyBank1");
    const evidence = result.classEvidence?.find((e) => e.className === "CatalystEfficiencyBank1");
    expect(evidence?.mode06.some((m) => m.mid === "21" && m.passed === false)).toBe(true);
  });

  it("folds RisingFuelTrim trend evidence into the ABox before realize", async () => {
    let sawRisingTrim = false;
    const realizer = (input: RealizeInput): RealizeResult => {
      sawRisingTrim = Object.values(input.abox.concepts).flat().includes("RisingFuelTrim");
      return {
        individual: input.individual,
        member: sawRisingTrim ? ["LeanFuelBank1"] : [],
        mostSpecific: sawRisingTrim ? ["LeanFuelBank1"] : [],
        undecided: [],
      };
    };
    const store = createMemoryStore();
    await seed(store);
    const customBridge = new FakeLogosBridge(undefined, realizer, undefined, (input) => ({
      n: input.series.length,
      threshold: input.threshold,
      current: input.series[input.series.length - 1]?.value ?? null,
      slopePerHour: 0.5,
      intercept: null,
      rSquared: 0.9,
      direction: "rising",
      willCross: true,
      hoursToThreshold: 5,
      crossAtHours: 5,
    }));
    const vehicles = new VehicleService(store);
    const forecast = new ForecastService(store, customBridge);
    const recognition = new RecognitionService(store, customBridge, vehicles, forecast);

    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      pids: [{ pid: "LONG_FUEL_TRIM_1", value: 8, timestamp: "2026-01-01T00:00:00Z" }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-02T00:00:00Z",
      source: "manual_entry",
      pids: [{ pid: "LONG_FUEL_TRIM_1", value: 15, timestamp: "2026-01-02T00:00:00Z" }],
    });

    await recognition.recognize(JEEP);
    expect(sawRisingTrim).toBe(true);
  });
});
