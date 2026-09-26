import { describe, expect, it } from "vitest";
import { gmVortec60StubCartridge } from "./gm-vortec-6.0-stub.ts";
import { knockSensorCartridge } from "./knock-sensor.ts";
import { leanFuelCartridge } from "./lean-fuel.ts";
import { draftForClass, resolveCartridgesForEngineFamily } from "./registry.ts";
import type { VehicleView } from "./types.ts";

const silverado: VehicleView = {
  vehicleId: "veh:silverado-2500hd-2003",
  label: "2003 Chevrolet Silverado 2500 HD",
  engineFamily: "gm-vortec-6.0",
  dtcs: [{ code: "P0332", status: "stored", description: "Knock Sensor 2 Circuit Low" }],
  pids: {},
};

describe("gmVortec60StubCartridge", () => {
  it("names the correct bank and cites TSB 02-06-04-023A for a P0332 (rear) knock sensor DTC", () => {
    const rule = gmVortec60StubCartridge.framing.find(
      (r) => r.whenClass === "KnockSensorCircuitFault",
    )!;
    const draft = rule.build(silverado);
    expect(draft.statement.currentState).toMatch(/rear-bank/);
    expect(draft.statement.gap).toMatch(/1999/);
    expect(draft.actions.some((a) => a.tags?.includes("tsb-02-06-04-023a"))).toBe(true);
    expect(draft.actions[0]?.id).toBe("confirm-rear-knock-bulletin-fit");
    expect(draft.causalModel?.mostLikelyCauses?.[0]).toMatch(/water intrusion/i);
  });

  it("names the front bank for a P0327-only DTC", () => {
    const vehicle: VehicleView = {
      ...silverado,
      dtcs: [{ code: "P0327", status: "stored", description: "Knock Sensor 1 Circuit Low" }],
    };
    const rule = gmVortec60StubCartridge.framing.find(
      (r) => r.whenClass === "KnockSensorCircuitFault",
    )!;
    const draft = rule.build(vehicle);
    expect(draft.statement.currentState).toMatch(/front-bank/);
    expect(draft.actions.some((a) => a.tags?.includes("tsb-02-06-04-023a"))).toBe(false);
  });

  it("flags a shared intake manifold gasket cause when both banks are lean together (TSB 05-06-04-029A)", () => {
    const bothLean: VehicleView = {
      ...silverado,
      dtcs: [
        { code: "P0171", status: "stored", description: "System Too Lean (Bank 1)" },
        { code: "P0174", status: "stored", description: "System Too Lean (Bank 2)" },
      ],
    };
    const rule1 = gmVortec60StubCartridge.framing.find((r) => r.whenClass === "LeanFuelBank1")!;
    const draft1 = rule1.build(bothLean);
    expect(draft1.statement.currentState).toMatch(/both banks/i);
    expect(draft1.statement.gap).toMatch(/P0300/);
    expect(draft1.statement.gap).not.toMatch(/documented signature/i);
    expect(draft1.causalModel?.mostLikelyCauses?.[0]).toMatch(/unmetered/i);
    expect(draft1.actions.some((a) => a.id === "replace-intake-gasket-teal")).toBe(true);
  });

  it("does not claim a shared gasket cause when only one bank is lean", () => {
    const oneLean: VehicleView = {
      ...silverado,
      dtcs: [{ code: "P0171", status: "stored", description: "System Too Lean (Bank 1)" }],
    };
    const rule1 = gmVortec60StubCartridge.framing.find((r) => r.whenClass === "LeanFuelBank1")!;
    const draft1 = rule1.build(oneLean);
    expect(draft1.statement.currentState).not.toMatch(/both banks/i);
  });

  it("outranks the generic knock-sensor and lean-fuel cartridges for a Silverado, but not for a Jeep", () => {
    const gmCartridges = resolveCartridgesForEngineFamily("gm-vortec-6.0");
    expect(gmCartridges).toContain(gmVortec60StubCartridge);
    expect(gmCartridges).toContain(knockSensorCartridge);
    expect(gmCartridges).toContain(leanFuelCartridge);

    const knockDraft = draftForClass(silverado, "KnockSensorCircuitFault", gmCartridges);
    expect(knockDraft?.label).toMatch(/023A/);

    const jeepCartridges = resolveCartridgesForEngineFamily("fca-tigershark-2.4");
    expect(jeepCartridges).not.toContain(gmVortec60StubCartridge);
    const jeepKnockDraft = draftForClass(
      { ...silverado, engineFamily: "fca-tigershark-2.4" },
      "KnockSensorCircuitFault",
      jeepCartridges,
    );
    expect(jeepKnockDraft?.label).not.toMatch(/GM Vortec/);
  });
});
