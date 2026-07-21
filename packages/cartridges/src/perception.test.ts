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
    const generic = resolveCartridgesForEngineFamily("gm-vortec-6.0");
    const abox = runPerception(
      "veh:silverado-2500hd-2003",
      [{ code: "P0011", status: "stored" }],
      {},
      generic,
    );
    // P0011 maps to MultiAirFault in the DTC dictionary, but Vortec cartridges
    // don't include fca-tigershark-2.4, so nothing fires.
    expect(abox.concepts["veh:silverado-2500hd-2003:multiair-fault"]).toBeUndefined();
  });

  it("ignores permanent-only DTCs (not currently active)", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [{ code: "P0304", status: "permanent" }], {}, cartridges);
    expect(abox.concepts["veh:x:cylinder-misfire"]).toBeUndefined();
  });

  it("asserts FailedEgrMonitor from a failed Mode 06 OBDMID $31", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [], {}, cartridges, [
      { tid: "01", mid: "31", value: 1, min: 0, max: 0.5, passed: false },
    ]);
    expect(abox.concepts["veh:x:mode06-egr"]).toEqual(["FailedEgrMonitor"]);
  });

  it("asserts CamCrankSensorCircuit from P0335", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [{ code: "P0335", status: "stored" }], {}, cartridges);
    expect(abox.concepts["veh:x:cam-crank-sensor"]).toEqual(["CamCrankSensorCircuit"]);
  });

  it("asserts FailedVvtMonitor from a failed Mode 06 OBDMID $35", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [], {}, cartridges, [
      { tid: "01", mid: "35", value: 1, min: 0, max: 0.5, passed: false },
    ]);
    expect(abox.concepts["veh:x:mode06-vvt"]).toEqual(["FailedVvtMonitor"]);
  });

  it("asserts EvapPurgeCode from P0441 and FailedEvapPurgeMonitor from $3D", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [{ code: "P0441", status: "stored" }], {}, cartridges, [
      { tid: "01", mid: "3D", value: 1, min: 0, max: 0.5, passed: false },
    ]);
    expect(abox.concepts["veh:x:evap-purge"]).toEqual(["EvapPurgeCode"]);
    expect(abox.concepts["veh:x:mode06-evap-purge"]).toEqual(["FailedEvapPurgeMonitor"]);
  });

  it("asserts ThermostatCode from P0128 and EctCircuitCode from P0118", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:x",
      [
        { code: "P0128", status: "stored" },
        { code: "P0118", status: "stored" },
      ],
      {},
      cartridges,
    );
    expect(abox.concepts["veh:x:thermostat"]).toEqual(["ThermostatCode"]);
    expect(abox.concepts["veh:x:ect-circuit"]).toEqual(["EctCircuitCode"]);
  });

  it("asserts coil / injector / MAP / knock / TPS circuit concepts", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception(
      "veh:x",
      [
        { code: "P0354", status: "stored" },
        { code: "P0201", status: "stored" },
        { code: "P0107", status: "stored" },
        { code: "P0325", status: "stored" },
        { code: "P0122", status: "stored" },
      ],
      {},
      cartridges,
    );
    expect(abox.concepts["veh:x:ignition-coil"]).toEqual(["IgnitionCoilCircuit"]);
    expect(abox.concepts["veh:x:injector-circuit"]).toEqual(["InjectorCircuitCode"]);
    expect(abox.concepts["veh:x:map-sensor"]).toEqual(["MapSensorCode"]);
    expect(abox.concepts["veh:x:knock-sensor"]).toEqual(["KnockSensorCode"]);
    expect(abox.concepts["veh:x:throttle-position"]).toEqual(["ThrottlePositionCode"]);
  });

  it("asserts FailedO2MonitorBank1 from a failed Mode 06 OBDMID $01", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [], {}, cartridges, [
      { tid: "01", mid: "01", value: 0.9, min: 0, max: 0.5, passed: false },
    ]);
    expect(abox.concepts["veh:x:mode06-o2-b1"]).toEqual(["FailedO2MonitorBank1"]);
  });

  it("asserts FailedCatalystMonitorBank1 from a failed Mode 06 OBDMID $21", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [], {}, cartridges, [
      { tid: "01", mid: "21", value: 0.9, min: 0, max: 0.5, passed: false },
    ]);
    expect(abox.concepts["veh:x:mode06-cat-b1"]).toEqual(["FailedCatalystMonitorBank1"]);
    expect(abox.roles).toContainEqual(["hasCondition", "veh:x", "veh:x:mode06-cat-b1"]);
  });

  it("does not invent meaning for unknown Mode 06 OBDMIDs", () => {
    const cartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    const abox = runPerception("veh:x", [], {}, cartridges, [
      { tid: "01", mid: "FE", value: 1, min: 0, max: 1, passed: false },
    ]);
    expect(Object.keys(abox.concepts)).toEqual(["veh:x"]);
  });
});
