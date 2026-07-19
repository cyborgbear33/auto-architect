import { describe, expect, it } from "vitest";
import { FakeLogosBridge } from "./fake.ts";
import type { LogosProblemInput } from "./types.ts";

const baseInput: LogosProblemInput = {
  id: "problem:1",
  statement: { currentState: "a", desiredState: "b", gap: "c" },
  desiredState: { successCriteria: "the fault clears" },
  actions: [
    {
      id: "cheap-test",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.9,
      cost: 0.1,
      risk: 0.1,
      reversibility: 1,
    },
    {
      id: "expensive-repair",
      impact: 0.9,
      confidence: 0.5,
      infoGain: 0.1,
      cost: 0.8,
      risk: 0.3,
      reversibility: 0.5,
    },
  ],
};

describe("FakeLogosBridge.solve", () => {
  it("recommends stabilize-first when Stability + a safety-tagged action exists", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.solve({
      ...baseInput,
      problemType: "Stability",
      actions: [
        ...baseInput.actions!,
        { id: "stop-now", tags: ["stabilize", "safety"], confidence: 0.9 },
      ],
    });
    expect(result.kind).toBe("stabilize-first");
    expect(result.recommended).toBe("stop-now");
  });

  it("escalates when Stability but no stabilizing action is available", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.solve({ ...baseInput, problemType: "Stability" });
    expect(result.kind).toBe("escalate");
    expect(result.recommended).toBeNull();
  });

  it("clarifies values when success criteria are missing", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.solve({ ...baseInput, desiredState: undefined });
    expect(result.kind).toBe("clarify-values");
  });

  it("picks the highest priority-scored action when nothing else gates", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.solve(baseInput);
    expect(result.kind).toBe("act");
    expect(result.recommended).toBe("cheap-test");
    expect(result.ranked[0]?.action.id).toBe("cheap-test");
  });

  it("disqualifies actions that violate a non-negotiable constraint", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.solve({
      ...baseInput,
      desiredState: { successCriteria: "x", nonNegotiableConstraints: ["never-drive-unsafe"] },
      actions: [
        { id: "unsafe-action", impact: 1, confidence: 1, violates: ["never-drive-unsafe"] },
        { id: "safe-action", impact: 0.3, confidence: 0.5 },
      ],
    });
    expect(result.disqualified.map((d) => d.actionId)).toEqual(["unsafe-action"]);
    expect(result.recommended).toBe("safe-action");
  });
});

describe("FakeLogosBridge.realize", () => {
  it("defaults to proving nothing (honest, not a guess)", async () => {
    const bridge = new FakeLogosBridge();
    const result = await bridge.realize({
      ontology: {},
      abox: { concepts: {}, roles: [] },
      individual: "veh:x",
    });
    expect(result.member).toEqual([]);
    expect(result.undecided).toEqual([]);
  });
});
