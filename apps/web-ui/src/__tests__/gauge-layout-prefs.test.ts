import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LIVE_GAUGE_PIDS } from "@auto/semantic-types";
import {
  loadGaugeLayout,
  resetGaugeLayout,
  saveGaugeLayout,
} from "../lib/gaugeLayoutPrefs.ts";

afterEach(() => {
  window.localStorage.clear();
});

describe("gaugeLayoutPrefs", () => {
  it("defaults when nothing is saved", () => {
    expect(loadGaugeLayout("veh:jeep")).toEqual([...DEFAULT_LIVE_GAUGE_PIDS]);
  });

  it("persists a normalized layout per vehicle", () => {
    expect(saveGaugeLayout("veh:jeep", ["SPEED", "RPM", "FAKE"])).toEqual(["SPEED", "RPM"]);
    expect(loadGaugeLayout("veh:jeep")).toEqual(["SPEED", "RPM"]);
    expect(loadGaugeLayout("veh:other")).toEqual([...DEFAULT_LIVE_GAUGE_PIDS]);
  });

  it("resets one vehicle without touching others", () => {
    saveGaugeLayout("veh:a", ["MAF"]);
    saveGaugeLayout("veh:b", ["SPEED"]);
    expect(resetGaugeLayout("veh:a")).toEqual([...DEFAULT_LIVE_GAUGE_PIDS]);
    expect(loadGaugeLayout("veh:b")).toEqual(["SPEED"]);
  });
});
