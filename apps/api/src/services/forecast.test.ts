import { describe, expect, it } from "vitest";
import { FakeLogosBridge } from "@auto/logos-bridge";
import { createMemoryStore } from "../store/index.ts";
import { ForecastService, OIL_LEVEL_PID } from "./forecast.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("ForecastService", () => {
  it("reports no decline with fewer than 2 samples", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, new FakeLogosBridge());
    expect((await forecast.oilLevelTrend(JEEP)).declining).toBe(false);
  });

  it("flags a declining trend when `forecast` reports willCross while falling", async () => {
    const store = createMemoryStore();
    const bridge = new FakeLogosBridge(
      undefined,
      undefined,
      undefined,
      (input) => ({
        n: input.series.length,
        threshold: input.threshold,
        current: input.series[input.series.length - 1]?.value ?? null,
        slopePerHour: -0.5,
        intercept: null,
        rSquared: 0.9,
        direction: "falling",
        willCross: true,
        hoursToThreshold: 40,
        crossAtHours: 40,
      }),
    );
    const forecast = new ForecastService(store, bridge);
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      pids: [{ pid: OIL_LEVEL_PID, value: 40, timestamp: "2026-01-01T00:00:00Z" }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-15T00:00:00Z",
      source: "manual_entry",
      pids: [{ pid: OIL_LEVEL_PID, value: 25, timestamp: "2026-01-15T00:00:00Z" }],
    });
    const trend = await forecast.oilLevelTrend(JEEP);
    expect(trend.declining).toBe(true);
    expect(trend.series).toHaveLength(2);
  });
});
