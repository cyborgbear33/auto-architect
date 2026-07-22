import { describe, expect, it } from "vitest";
import { fluentForClass } from "../components/NextActionConsole.tsx";

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
