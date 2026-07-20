import { FakeLogosBridge } from "@auto/logos-bridge";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import {
  ENGINE_LOAD_PID,
  ForecastService,
  HIGH_LOAD_PCT,
  LTFT_B1_PID,
  OIL_LEVEL_PID,
  POSITIVE_TRIM_PCT,
} from "./forecast.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

function risingBridge() {
  return new FakeLogosBridge(undefined, undefined, undefined, (input) => ({
    n: input.series.length,
    threshold: input.threshold,
    current: input.series[input.series.length - 1]?.value ?? null,
    slopePerHour: 0.5,
    intercept: null,
    rSquared: 0.9,
    direction: "rising" as const,
    willCross: true,
    hoursToThreshold: 10,
    crossAtHours: 10,
  }));
}

function fallingBridge() {
  return new FakeLogosBridge(undefined, undefined, undefined, (input) => ({
    n: input.series.length,
    threshold: input.threshold,
    current: input.series[input.series.length - 1]?.value ?? null,
    slopePerHour: -0.5,
    intercept: null,
    rSquared: 0.9,
    direction: "falling" as const,
    willCross: true,
    hoursToThreshold: 40,
    crossAtHours: 40,
  }));
}

async function recordPid(
  store: ReturnType<typeof createMemoryStore>,
  pid: string,
  values: Array<{ at: string; value: number }>,
) {
  for (const v of values) {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: v.at,
      source: "manual_entry",
      pids: [{ pid, value: v.value, timestamp: v.at }],
    });
  }
}

describe("ForecastService", () => {
  it("reports no decline with fewer than 2 samples", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, new FakeLogosBridge());
    expect((await forecast.oilLevelTrend(JEEP)).declining).toBe(false);
    const summary = await forecast.summary(JEEP);
    expect(summary.signals.length).toBeGreaterThan(1);
    expect(summary.recognitionTrends).toEqual([]);
  });

  it("flags a declining oil trend when forecast reports willCross while falling", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, fallingBridge());
    await recordPid(store, OIL_LEVEL_PID, [
      { at: "2026-01-01T00:00:00Z", value: 40 },
      { at: "2026-01-15T00:00:00Z", value: 25 },
    ]);
    const trend = await forecast.oilLevelTrend(JEEP);
    expect(trend.declining).toBe(true);
    expect(trend.series).toHaveLength(2);
    const summary = await forecast.summary(JEEP);
    expect(summary.recognitionTrends).toContain("OilLevelDecline");
  });

  it("flags rising LTFT as RisingFuelTrim for recognition", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, risingBridge());
    await recordPid(store, LTFT_B1_PID, [
      { at: "2026-01-01T00:00:00Z", value: POSITIVE_TRIM_PCT - 2 },
      { at: "2026-01-02T00:00:00Z", value: POSITIVE_TRIM_PCT + 5 },
    ]);
    const summary = await forecast.summary(JEEP);
    const ltft = summary.signals.find((s) => s.id === "ltft-b1");
    expect(ltft?.flagged).toBe(true);
    expect(ltft?.ontologyTrend).toBe("RisingFuelTrim");
    expect(summary.recognitionTrends).toContain("RisingFuelTrim");
  });

  it("flags recurring high ENGINE_LOAD as RecurringHighLoad", async () => {
    const store = createMemoryStore();
    // Flat direction but two samples already above threshold.
    const bridge = new FakeLogosBridge(undefined, undefined, undefined, (input) => ({
      n: input.series.length,
      threshold: input.threshold,
      current: input.series[input.series.length - 1]?.value ?? null,
      slopePerHour: 0,
      intercept: null,
      rSquared: 0.1,
      direction: "flat" as const,
      willCross: false,
      hoursToThreshold: null,
      crossAtHours: null,
    }));
    const forecast = new ForecastService(store, bridge);
    await recordPid(store, ENGINE_LOAD_PID, [
      { at: "2026-01-01T00:00:00Z", value: HIGH_LOAD_PCT + 5 },
      { at: "2026-01-02T00:00:00Z", value: HIGH_LOAD_PCT + 10 },
    ]);
    const summary = await forecast.summary(JEEP);
    const load = summary.signals.find((s) => s.id === "engine-load");
    expect(load?.flagged).toBe(true);
    expect(load?.ontologyTrend).toBe("RecurringHighLoad");
    expect(summary.recognitionTrends).toContain("RecurringHighLoad");
  });

  it("surfaces coolant climb as informing-only (never recognitionTrends)", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, risingBridge());
    await recordPid(store, "COOLANT_TEMP", [
      { at: "2026-01-01T00:00:00Z", value: 90 },
      { at: "2026-01-02T00:00:00Z", value: 110 },
    ]);
    const summary = await forecast.summary(JEEP);
    const coolant = summary.signals.find((s) => s.id === "coolant");
    expect(coolant?.flagged).toBe(false);
    expect(coolant?.flagReason).toMatch(/informing only/);
    expect(summary.recognitionTrends).not.toContain("CoolantClimb");
    expect(summary.scope).toBe("vehicle");
    expect(summary.sessionId).toBeNull();
  });

  it("scopes series to a drive session when sessionId is set (F4)", async () => {
    const store = createMemoryStore();
    const forecast = new ForecastService(store, risingBridge());
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "simulated",
      sessionId: "session:a",
      pids: [{ pid: LTFT_B1_PID, value: 5, timestamp: "2026-01-01T00:00:00Z" }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T01:00:00Z",
      source: "simulated",
      sessionId: "session:a",
      pids: [{ pid: LTFT_B1_PID, value: 15, timestamp: "2026-01-01T01:00:00Z" }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-02T00:00:00Z",
      source: "simulated",
      sessionId: "session:b",
      pids: [{ pid: LTFT_B1_PID, value: 20, timestamp: "2026-01-02T00:00:00Z" }],
    });

    const global = await forecast.summary(JEEP);
    const scoped = await forecast.summary(JEEP, { sessionId: "session:a" });
    const ltftGlobal = global.signals.find((s) => s.id === "ltft-b1");
    const ltftScoped = scoped.signals.find((s) => s.id === "ltft-b1");
    expect(ltftGlobal?.series).toHaveLength(3);
    expect(ltftScoped?.series).toHaveLength(2);
    expect(scoped.scope).toBe("session");
    expect(scoped.sessionId).toBe("session:a");
  });
});
