import { describe, expect, it } from "vitest";
import { composeClassEvidence } from "./class-evidence.ts";
import { leanFuelCartridge } from "./lean-fuel.ts";
import { misfireCartridge } from "./misfire.ts";

describe("composeClassEvidence", () => {
  it("attaches supporting DTCs, threshold PIDs, and matching freeze-frames", () => {
    const bundle = composeClassEvidence(
      "LeanFuelBank1",
      [leanFuelCartridge, misfireCartridge],
      [
        { code: "P0171", status: "stored", description: "System Too Lean (Bank 1)" },
        { code: "P0304", status: "stored", description: "Cylinder 4 Misfire" },
        { code: "P0171", status: "permanent", description: "ignored permanent" },
      ],
      { LONG_FUEL_TRIM_1: 18, ENGINE_LOAD: 80 },
      [
        {
          dtc: "P0171",
          readings: [
            { pid: "ENGINE_LOAD", value: 72, unit: "%", timestamp: "2026-01-01T00:00:00Z" },
          ],
        },
        {
          dtc: "P0304",
          readings: [{ pid: "RPM", value: 2500, timestamp: "2026-01-01T00:00:00Z" }],
        },
      ],
    );

    expect(bundle.className).toBe("LeanFuelBank1");
    expect(bundle.dtcs.map((d) => d.code)).toEqual(["P0171"]);
    expect(bundle.pids).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pid: "LONG_FUEL_TRIM_1", value: 18, thresholdMet: true }),
      ]),
    );
    expect(bundle.freezeFrames).toHaveLength(1);
    expect(bundle.freezeFrames[0]?.dtc).toBe("P0171");
    expect(bundle.mode06).toEqual([]);
  });

  it("returns empty evidence when no cartridge frames the class", () => {
    const bundle = composeClassEvidence("UnknownClass", [leanFuelCartridge], [], {}, []);
    expect(bundle.dtcs).toEqual([]);
    expect(bundle.pids).toEqual([]);
    expect(bundle.freezeFrames).toEqual([]);
    expect(bundle.mode06).toEqual([]);
  });
});
