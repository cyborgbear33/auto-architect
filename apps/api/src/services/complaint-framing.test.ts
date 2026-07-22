import { describe, expect, it } from "vitest";
import { enrichFramingWithComplaints, normalizeComplaints } from "./complaint-framing.ts";

describe("normalizeComplaints", () => {
  it("trims, dedupes, and caps length", () => {
    expect(
      normalizeComplaints(["  rough idle ", "ROUGH IDLE", "fuel smell", "", "x".repeat(201)]),
    ).toEqual(["rough idle", "fuel smell"]);
  });
});

describe("enrichFramingWithComplaints", () => {
  it("appends operator reports without inventing fault classes", () => {
    const framed = enrichFramingWithComplaints(
      { currentState: "misfire under load", desiredState: "smooth", gap: "cause unknown" },
      { symptoms: ["P0304"], mostLikelyCauses: ["ignition"] },
      ["rough idle", "fuel smell"],
    );
    expect(framed.statement.currentState).toMatch(/Operator reports: rough idle; fuel smell/);
    expect(framed.causalModel.symptoms).toEqual([
      "P0304",
      "operator: rough idle",
      "operator: fuel smell",
    ]);
    expect(framed.causalModel.mostLikelyCauses).toEqual(["ignition"]);
  });
});
