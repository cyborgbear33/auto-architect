import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import {
  enrichDtcDescription,
  LIVE_GAUGE_STALE_AFTER_MS,
  ObservationService,
} from "./observations.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("enrichDtcDescription", () => {
  it("fills SAE dictionary text when the adapter left description empty", () => {
    expect(enrichDtcDescription({ code: "P0304", status: "stored" }).description).toBe(
      "Cylinder 4 Misfire Detected",
    );
  });

  it("keeps adapter description when present", () => {
    expect(
      enrichDtcDescription({
        code: "P0304",
        status: "stored",
        description: "from adapter",
      }).description,
    ).toBe("from adapter");
  });
});

describe("ObservationService.latestDtcs", () => {
  const store = createMemoryStore();
  const vehicles = new VehicleService(store);
  const observations = new ObservationService(store, vehicles);

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("returns dictionary descriptions for codes posted without text", async () => {
    await observations.record({
      vehicleId: JEEP,
      capturedAt: new Date().toISOString(),
      source: "simulated",
      dtcs: [{ code: "P0304", status: "stored" }],
    });
    const dtcs = await observations.latestDtcs(JEEP);
    expect(dtcs).toEqual([
      { code: "P0304", status: "stored", description: "Cylinder 4 Misfire Detected" },
    ]);
  });
});

describe("ObservationService.liveGauges", () => {
  const store = createMemoryStore();
  const vehicles = new VehicleService(store);
  const observations = new ObservationService(store, vehicles);

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("returns empty gauge values when no batches exist (strip stale)", async () => {
    const strip = await observations.liveGauges(JEEP);
    expect(strip.stale).toBe(true);
    expect(strip.gauges.map((g) => g.pid)).toEqual([
      "RPM",
      "ENGINE_LOAD",
      "SHORT_FUEL_TRIM_1",
      "COOLANT_TEMP",
    ]);
    expect(strip.gauges.every((g) => g.value === null)).toBe(true);
  });

  it("fills units from the PID dictionary and marks fresh batches not stale", async () => {
    const now = new Date().toISOString();
    await observations.record({
      vehicleId: JEEP,
      capturedAt: now,
      source: "simulated",
      pids: [
        { pid: "RPM", value: 2100, unit: "rpm", timestamp: now },
        { pid: "ENGINE_LOAD", value: 42, unit: "percent", timestamp: now },
        { pid: "SHORT_FUEL_TRIM_1", value: 8.5, unit: "percent", timestamp: now },
        { pid: "COOLANT_TEMP", value: 91, unit: "celsius", timestamp: now },
      ],
    });

    const strip = await observations.liveGauges(JEEP);
    expect(strip.stale).toBe(false);
    expect(strip.staleAfterMs).toBe(LIVE_GAUGE_STALE_AFTER_MS);
    expect(strip.source).toBe("simulated");
    const rpm = strip.gauges.find((g) => g.pid === "RPM");
    expect(rpm?.value).toBe(2100);
    expect(rpm?.unit).toBe("rpm");
    expect(rpm?.label).toBe("RPM");
    expect(strip.gauges.find((g) => g.pid === "ENGINE_LOAD")?.unit).toBe("percent");
  });

  it("marks the strip stale when the latest batch is older than the threshold", async () => {
    const old = new Date(Date.now() - LIVE_GAUGE_STALE_AFTER_MS - 5_000).toISOString();
    await observations.record({
      vehicleId: JEEP,
      capturedAt: old,
      source: "obd_gateway",
      pids: [{ pid: "RPM", value: 800, timestamp: old }],
    });
    const strip = await observations.liveGauges(JEEP);
    expect(strip.stale).toBe(true);
    expect(strip.ageMs).toBeGreaterThan(LIVE_GAUGE_STALE_AFTER_MS);
  });
});
