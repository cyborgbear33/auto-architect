import { describe, expect, it } from "vitest";
import { runPerception } from "./perception.ts";
import { resolveCartridgesForEngineFamily } from "./registry.ts";

describe("runPerception", () => {
  it("asserts CylinderMisfire + HighLoad from a P0304 DTC and high ENGINE_LOAD (matches the realize fixture)", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:jeep-renegade-2015-latitude",
      [{ code: "P0304", status: "stored" }],
      { ENGINE_LOAD: 82 },
      cartridges,
    );

    expect(abox.concepts["veh:jeep-renegade-2015-latitude"]).toEqual(["Engine"]);
    expect(abox.concepts["veh:jeep-renegade-2015-latitude:cylinder-misfire"]).toEqual([
      "CylinderMisfire",
    ]);
    expect(abox.concepts["veh:jeep-renegade-2015-latitude:high-load"]).toEqual(["HighLoad"]);
    expect(abox.roles).toContainEqual([
      "hasDtc",
      "veh:jeep-renegade-2015-latitude",
      "veh:jeep-renegade-2015-latitude:cylinder-misfire",
    ]);
    expect(abox.roles).toContainEqual([
      "hasCondition",
      "veh:jeep-renegade-2015-latitude",
      "veh:jeep-renegade-2015-latitude:high-load",
    ]);
  });

  it("does not assert HighLoad below the threshold", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:x",
      [{ code: "P0304", status: "stored" }],
      { ENGINE_LOAD: 40 },
      cartridges,
    );
    expect(abox.concepts["veh:x:high-load"]).toBeUndefined();
  });

  it("only loads Tigershark-only concepts (MultiAirFault) for the fca-tigershark-2.4 engine family", () => {
    const generic = resolveCartridgesForEngineFamily("gm-ecotec3-tbd");
    const abox = runPerception("veh:silverado", [{ code: "P0011", status: "stored" }], {}, generic);
    // P0011 maps to MultiAirFault in the DTC dictionary, but the generic engine
    // family's cartridges don't include fca-tigershark-2.4, so nothing fires.
    expect(abox.concepts["veh:silverado:multiair-fault"]).toBeUndefined();
  });

  it("ignores permanent-only DTCs (not currently active)", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [{ code: "P0304", status: "permanent" }], {}, cartridges);
    expect(abox.concepts["veh:x:cylinder-misfire"]).toBeUndefined();
  });

  it("asserts FailedCatalystMonitorBank1 from a failed Mode 06 OBDMID $21", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:x",
      [],
      {},
      cartridges,
      [{ tid: "01", mid: "21", value: 0.9, min: 0, max: 0.5, passed: false }],
    );
    expect(abox.concepts["veh:x:mode06-cat-b1"]).toEqual(["FailedCatalystMonitorBank1"]);
    expect(abox.roles).toContainEqual(["hasCondition", "veh:x", "veh:x:mode06-cat-b1"]);
  });

  it("does not invent meaning for unknown Mode 06 OBDMIDs", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:x",
      [],
      {},
      cartridges,
      [{ tid: "01", mid: "FE", value: 1, min: 0, max: 1, passed: false }],
    );
    expect(Object.keys(abox.concepts)).toEqual(["veh:x"]);
  });
});
