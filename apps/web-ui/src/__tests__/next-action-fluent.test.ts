import { describe, expect, it } from "vitest";
import { dashboardDecision, fluentForClass } from "../components/NextActionConsole.tsx";

describe("fluentForClass", () => {
  it("prefers narration fluent over the raw class id", () => {
    expect(
      fluentForClass("MisfireUnderLoad", [
        {
          className: "MisfireUnderLoad",
          fluent: "Cylinder misfire under high load.",
          source: "ontology_note",
        },
      ]),
    ).toBe("Cylinder misfire under high load.");
  });

  it("falls back to the class id when narration is missing or echoed", () => {
    expect(fluentForClass("MisfireUnderLoad", undefined)).toBe("MisfireUnderLoad");
    expect(
      fluentForClass("MisfireUnderLoad", [
        {
          className: "MisfireUnderLoad",
          fluent: "MisfireUnderLoad",
          source: "class_name",
        },
      ]),
    ).toBe("MisfireUnderLoad");
  });
});

describe("dashboardDecision", () => {
  it("offers the scan guide when nothing is on file", () => {
    const decision = dashboardDecision({
      loading: false,
      hasEvidence: false,
      provenFluent: [],
      activeCaseCount: 0,
    });
    expect(decision.headline).toBe("Nothing is classified yet");
    expect(decision.primary).toEqual({ label: "How to scan", to: "/guide" });
  });

  it("does not invent a primary action while the vehicle is still loading", () => {
    expect(
      dashboardDecision({
        loading: true,
        hasEvidence: false,
        provenFluent: [],
        activeCaseCount: 0,
      }).primary,
    ).toBeNull();
  });

  it("names the ranked recommendation as the one next step", () => {
    const decision = dashboardDecision({
      loading: false,
      hasEvidence: true,
      provenFluent: ["Cylinder misfire under high load."],
      topRecTitle: "Swap the coil and plug",
      topRecReason: "a sustained misfire can destroy the catalytic converter",
      activeCaseCount: 0,
    });
    expect(decision.headline).toBe("Next: Swap the coil and plug");
    expect(decision.detail).toMatch(/catalytic converter/);
    expect(decision.primary).toEqual({ label: "Take this next", to: "/diagnosis" });
  });
});
