import { describe, expect, it } from "vitest";
import { listProblemCatalog, problemLookupPrefill } from "./problem-catalog.ts";

describe("listProblemCatalog", () => {
  it("lists misfire with its codes, media, and a later catalyst watch", () => {
    const row = listProblemCatalog().find((entry) => entry.id === "MisfireUnderLoad");
    expect(row?.label).toBe("Misfire under load");
    expect(row?.kind).toBe("fault-class");
    expect(row?.categories.map((c) => c.id)).toEqual(expect.arrayContaining(["mechanical", "air"]));
    expect(row?.codes).toContain("P0300");
    expect(row?.leadsTo.some((link) => link.id === "CatalystEfficiencyBank1")).toBe(true);
    expect(row?.definition.length).toBeGreaterThan(0);
  });

  it("keeps MultiAir on the Tigershark view and off the Vortec view", () => {
    expect(
      listProblemCatalog("fca-tigershark-2.4").some((row) => row.id === "MultiAirOilStarvation"),
    ).toBe(true);
    expect(
      listProblemCatalog("gm-vortec-6.0").some((row) => row.id === "MultiAirOilStarvation"),
    ).toBe(false);
  });

  it("treats thin brake pads as an inspection that can lead to rotor scoring", () => {
    const row = listProblemCatalog("gm-vortec-6.0").find((entry) => entry.id === "BrakePadThin");
    expect(row?.kind).toBe("inspection");
    expect(row?.categories.map((c) => c.label)).toContain("Brakes");
    expect(row?.codes).toEqual([]);
    expect(row?.leadsTo.some((link) => link.id === "RotorScoringRisk")).toBe(true);
  });

  it("prefills the lookup from a diagnosed class", () => {
    expect(problemLookupPrefill("CoolantThermostatFault")).toEqual({
      search: "Coolant thermostat fault",
      category: "fluid",
    });
    expect(problemLookupPrefill("MisfireUnderLoad")?.category).toBe("all");
    expect(problemLookupPrefill("MisfireUnderLoad")?.search).toBe("Misfire under load");
    expect(problemLookupPrefill("not-a-class")).toBeNull();
  });

  it("records that a catalyst code can follow a proved misfire", () => {
    const row = listProblemCatalog().find((entry) => entry.id === "CatalystEfficiencyBank1");
    expect(row?.followsFrom.some((link) => link.id === "MisfireUnderLoad")).toBe(true);
  });
});
