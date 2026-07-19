import { describe, expect, it } from "vitest";
import {
  campaignsForEngineFamily,
  getEngineFamilyCartridges,
  getEngineFamilyView,
  getVehicleProfile,
  lookupDtc,
  lookupPid,
  tsbsForEngineFamily,
  unitForPid,
} from "./index.ts";

describe("ontology registries", () => {
  it("resolves the Jeep Renegade profile to the fca-tigershark-2.4 engine family", () => {
    const vehicle = getVehicleProfile("veh:jeep-renegade-2015-latitude");
    expect(vehicle?.engineFamily).toBe("fca-tigershark-2.4");
    expect(getEngineFamilyView("fca-tigershark-2.4")).toBe("fca-tigershark-2.4");
    expect(getEngineFamilyCartridges("fca-tigershark-2.4")).toContain("fca-tigershark-2.4");
  });

  it("resolves the Silverado stub to the generic view (no Tigershark cartridge)", () => {
    expect(getEngineFamilyView("gm-ecotec3-tbd")).toBe("generic");
    expect(getEngineFamilyCartridges("gm-ecotec3-tbd")).not.toContain("fca-tigershark-2.4");
  });

  it("looks up P0304 as a CylinderMisfire concept", () => {
    expect(lookupDtc("p0304")?.concept).toBe("CylinderMisfire");
  });

  it("covers the full P0016–P0019 cam/crank correlation family", () => {
    for (const code of ["P0016", "P0017", "P0018", "P0019"]) {
      expect(lookupDtc(code)?.concept).toBe("CamCrankCorrelation");
    }
  });

  it("returns undefined for an unknown DTC", () => {
    expect(lookupDtc("P9999")).toBeUndefined();
  });

  it("seeds cartridge and default-poll PIDs with units and Mode 01 hex", () => {
    expect(lookupPid("ENGINE_LOAD")).toMatchObject({
      unit: "percent",
      mode: "01",
      pidHex: "0x04",
      sae: true,
    });
    expect(unitForPid("LONG_FUEL_TRIM_1")).toBe("percent");
    expect(lookupPid("OIL_PRESSURE_PSI")).toMatchObject({
      unit: "psi",
      manualOnly: true,
      sae: false,
    });
    expect(lookupPid("RPM")?.pidHex).toBe("0x0C");
  });

  it("returns undefined for an unknown PID key", () => {
    expect(lookupPid("NOT_A_REAL_PID")).toBeUndefined();
  });

  it("matches W80/W84 campaigns to the Tigershark engine family within the year range", () => {
    const campaigns = campaignsForEngineFamily("fca-tigershark-2.4", 2015);
    expect(campaigns.map((c) => c.id).sort()).toEqual(["W80", "W84"]);
    expect(campaignsForEngineFamily("fca-tigershark-2.4", 2025)).toEqual([]);
  });

  it("finds the MultiAir TSB for the Tigershark engine family", () => {
    const tsbs = tsbsForEngineFamily("fca-tigershark-2.4");
    expect(tsbs.some((t) => t.id === "05-047-457A")).toBe(true);
  });
});
