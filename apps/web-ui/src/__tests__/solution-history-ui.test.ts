import { describe, expect, it } from "vitest";
import { faultClassForDtc, topWorkedBuckets } from "../components/solutionHistoryUi.ts";

describe("solutionHistoryUi", () => {
  it("joins a DTC to a proven class only via classEvidence", () => {
    expect(
      faultClassForDtc("P0304", [
        {
          className: "MisfireUnderLoad",
          dtcs: [{ code: "P0304", status: "stored" }],
          pids: [],
          freezeFrames: [],
          mode06: [],
        },
      ]),
    ).toBe("MisfireUnderLoad");
    expect(faultClassForDtc("P0304", undefined)).toBeUndefined();
    expect(
      faultClassForDtc("P0171", [
        {
          className: "MisfireUnderLoad",
          dtcs: [{ code: "P0304", status: "stored" }],
          pids: [],
          freezeFrames: [],
          mode06: [],
        },
      ]),
    ).toBeUndefined();
  });

  it("prefers vehicle worked buckets over family", () => {
    const tops = topWorkedBuckets({
      vehicleId: "veh:x",
      engineFamily: "generic",
      faultClassFilter: "MisfireUnderLoad",
      vehicle: [
        {
          actionId: "swap-coil-plug",
          faultClass: "MisfireUnderLoad",
          scope: "vehicle",
          engineFamily: "generic",
          worked: 1,
          partial: 0,
          failed: 0,
          inconclusive: 0,
          totalWithOutcome: 1,
          lastDecidedAt: null,
        },
      ],
      engineFamilyRollup: [
        {
          actionId: "compression-leakdown-test",
          faultClass: "MisfireUnderLoad",
          scope: "engineFamily",
          engineFamily: "generic",
          worked: 9,
          partial: 0,
          failed: 0,
          inconclusive: 0,
          totalWithOutcome: 9,
          lastDecidedAt: null,
        },
      ],
      narratives: [],
    });
    expect(tops.map((b) => b.actionId)).toEqual(["swap-coil-plug"]);
  });
});
