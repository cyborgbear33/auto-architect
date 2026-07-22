import { describe, expect, it } from "vitest";
import {
  CAUSAL_BRIEF_INTEGRITY,
  composeCausalBriefSections,
  historyNotesFromSolutionHistory,
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
    });
    expect(brief.why).toMatch(/Most likely: ignition/i);
    expect(brief.howWeKnow[0]).toMatch(/P0300-P0304/);
    expect(brief.whatToProveNext).toEqual(["swap coil and plug"]);
    expect(brief.integrityNote).toBe(CAUSAL_BRIEF_INTEGRITY);
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
