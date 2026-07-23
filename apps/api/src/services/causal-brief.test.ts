import { describe, expect, it } from "vitest";
import {
  CAUSAL_BRIEF_INTEGRITY,
  composeCausalBriefSections,
  historyNotesFromSolutionHistory,
  oemAlsoSaysForClass,
  whatToProveNextFromModel,
} from "./causal-brief.ts";

describe("composeCausalBriefSections", () => {
  it("leads with most-likely cause and keeps integrity note", () => {
    const brief = composeCausalBriefSections({
      vehicleId: "veh:x",
      faultClass: "MisfireUnderLoad",
      causalModel: {
        symptoms: ["P0304"],
        mostLikelyCauses: ["ignition coil/plug — swap test first"],
        possibleCauses: ["injector", "mechanical"],
      },
      fluent: "P0300-P0304 + high load evidence.",
      historyNotes: ["No confirmed outcomes yet."],
      proveNext: ["swap coil and plug"],
      gap: "root cause not isolated",
      operatorComplaints: ["rough idle"],
      oemAlsoSays: [
        {
          id: "W80",
          title: "Oil Consumption",
          kind: "campaign",
          steps: ["Top off oil"],
          applicabilityNote: "Applicability only — not a LOGOS-proven fault class.",
        },
      ],
    });
    expect(brief.why).toMatch(/Most likely: ignition/i);
    expect(brief.howWeKnow[0]).toMatch(/P0300-P0304/);
    expect(brief.howWeKnow).toContain("Operator reports: rough idle");
    expect(brief.operatorComplaints).toEqual(["rough idle"]);
    expect(brief.oemAlsoSays?.[0]?.id).toBe("W80");
    expect(brief.whatToProveNext).toEqual(["swap coil and plug"]);
    expect(brief.integrityNote).toBe(CAUSAL_BRIEF_INTEGRITY);
  });
});

describe("oemAlsoSaysForClass", () => {
  it("includes only campaigns/TSBs related to the fault class", () => {
    const notes = oemAlsoSaysForClass(
      "MultiAirOilStarvation",
      [
        {
          id: "W80",
          title: "Oil Consumption",
          engineFamily: "fca-tigershark-2.4",
          yearRange: [2015, 2018],
          summary: "oil",
          relatedClasses: ["MultiAirOilStarvation"],
          steps: ["Top off oil"],
        },
        {
          id: "OTHER",
          title: "Unrelated",
          engineFamily: "fca-tigershark-2.4",
          yearRange: [2015, 2018],
          summary: "no",
          relatedClasses: ["MisfireUnderLoad"],
          steps: ["ignore"],
        },
      ],
      [
        {
          id: "05-047-457A",
          title: "MultiAir procedure",
          engineFamily: "fca-tigershark-2.4",
          summary: "oil first",
          reference: "TSB",
          relatedClasses: ["MultiAirOilStarvation"],
          steps: ["Verify oil not low"],
        },
      ],
    );
    expect(notes.map((n) => n.id).sort()).toEqual(["05-047-457A", "W80"]);
    expect(notes.every((n) => n.applicabilityNote.includes("Applicability only"))).toBe(true);
  });

  it("returns empty for unrelated classes (never invents membership)", () => {
    expect(
      oemAlsoSaysForClass(
        "MisfireUnderLoad",
        [
          {
            id: "W80",
            title: "Oil",
            engineFamily: "fca-tigershark-2.4",
            yearRange: [2015, 2018],
            summary: "oil",
            relatedClasses: ["MultiAirOilStarvation"],
            steps: ["Top off"],
          },
        ],
        [],
      ),
    ).toEqual([]);
  });
});

describe("historyNotesFromSolutionHistory", () => {
  it("prefers narrative lessons over n= rollups", () => {
    const notes = historyNotesFromSolutionHistory({
      vehicleId: "veh:x",
      engineFamily: "fca-tigershark-2.4",
      faultClassFilter: "MisfireUnderLoad",
      vehicle: [
        {
          actionId: "swap-coil-plug",
          faultClass: "MisfireUnderLoad",
          scope: "vehicle",
          engineFamily: "fca-tigershark-2.4",
          worked: 2,
          partial: 0,
          failed: 0,
          inconclusive: 0,
          totalWithOutcome: 2,
          lastDecidedAt: "2026-01-01T00:00:00Z",
        },
      ],
      engineFamilyRollup: [],
      narratives: [
        {
          decisionId: "dec:1",
          problemId: "prob:1",
          actionId: "swap-coil-plug",
          faultClass: "MisfireUnderLoad",
          outcome: "worked",
          verify: "passed",
          whyBelieved: "coil #4 misfire counts dropped",
          decidedAt: "2026-01-01T00:00:00Z",
          lesson:
            "swap-coil-plug → MisfireUnderLoad → worked → verify passed — why believed: coil #4 misfire counts dropped",
        },
      ],
    });
    expect(notes[0]).toMatch(/why believed: coil #4/);
  });

  it("falls back to vehicle worked buckets when narratives empty", () => {
    const notes = historyNotesFromSolutionHistory({
      vehicleId: "veh:x",
      engineFamily: "fca-tigershark-2.4",
      faultClassFilter: "MisfireUnderLoad",
      vehicle: [
        {
          actionId: "swap-coil-plug",
          faultClass: "MisfireUnderLoad",
          scope: "vehicle",
          engineFamily: "fca-tigershark-2.4",
          worked: 2,
          partial: 0,
          failed: 0,
          inconclusive: 0,
          totalWithOutcome: 2,
          lastDecidedAt: "2026-01-01T00:00:00Z",
        },
      ],
      engineFamilyRollup: [],
      narratives: [],
    });
    expect(notes[0]).toMatch(/swap-coil-plug worked 2\/2/);
  });
});

describe("whatToProveNextFromModel", () => {
  it("falls back to mostLikelyCauses when actions empty", () => {
    expect(
      whatToProveNextFromModel({ mostLikelyCauses: ["vacuum leak"] }, []),
    ).toEqual(["Prove or rule out: vacuum leak"]);
  });
});
