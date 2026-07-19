import { describe, expect, it } from "vitest";
import { analyzeCooperative, analyzeDecision, analyzeZeroSum } from "./index.ts";

describe("analyzeDecision", () => {
  it("maximin picks the action with the best worst-case payoff", () => {
    const result = analyzeDecision({
      actions: ["diagnose-first", "guess-and-replace"],
      states: ["root-cause-A", "root-cause-B"],
      payoffs: [
        [5, 5],
        [10, -10],
      ],
    });
    const maximin = result.criteria.find((c) => c.criterion === "maximin")!;
    expect(maximin.bestActions).toEqual([0]);
  });

  it("flags unanimous when every criterion agrees", () => {
    const result = analyzeDecision({
      actions: ["dominant", "dominated"],
      states: ["s1", "s2"],
      payoffs: [
        [10, 10],
        [1, 1],
      ],
    });
    expect(result.unanimous).toBe(true);
    expect(result.dominated).toEqual([1]);
  });
});

describe("analyzeZeroSum", () => {
  it("finds a saddle point when one exists", () => {
    const result = analyzeZeroSum([
      [1, 2],
      [0, 3],
    ]);
    expect(result.hasSaddle).toBe(true);
    expect(result.saddlePoint).toEqual({ row: 0, col: 0, value: 1 });
  });
});

describe("analyzeCooperative", () => {
  it("computes a Shapley value that sums to the grand coalition's value", () => {
    const players = ["shop", "owner"];
    const v = (members: string[]) => {
      if (members.length === 2) return 100;
      if (members.length === 1) return 30;
      return 0;
    };
    const result = analyzeCooperative(players, v);
    const total = Object.values(result.shapley).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100);
    expect(result.shapleyInCore).toBe(true);
  });
});
