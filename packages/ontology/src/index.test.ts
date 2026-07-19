import { describe, expect, it } from "vitest";
import {
  campaignsForEngineFamily,
  getEngineFamilyCartridges,
  getEngineFamilyView,
  getVehicleProfile,
  lookupDtc,
  tsbsForEngineFamily,
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

  it("returns undefined for an unknown DTC", () => {
    expect(lookupDtc("P9999")).toBeUndefined();
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
