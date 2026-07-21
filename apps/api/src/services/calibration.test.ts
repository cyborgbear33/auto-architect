import type { CandidateAction, SolutionHistory, SolutionRollupBucket } from "@auto/semantic-types";
import { describe, expect, it } from "vitest";
import { calibratePlaybook, empiricalSuccessRate, shrinkTowardPrior } from "./calibration.ts";

function bucket(
  overrides: Partial<SolutionRollupBucket> & Pick<SolutionRollupBucket, "actionId" | "faultClass">,
): SolutionRollupBucket {
  return {
    scope: "vehicle",
    engineFamily: "fca-tigershark-2.4",
    worked: 0,
    partial: 0,
    failed: 0,
    inconclusive: 0,
    totalWithOutcome: 0,
    lastDecidedAt: null,
    ...overrides,
  };
}

function history(vehicle: SolutionRollupBucket[]): SolutionHistory {
  return {
    vehicleId: "veh:test",
    engineFamily: "fca-tigershark-2.4",
    faultClassFilter: "MisfireUnderLoad",
    vehicle,
    engineFamilyRollup: vehicle.map((b) => ({ ...b, scope: "engineFamily" as const })),
  };
}

const actions: CandidateAction[] = [
  { id: "swap-coil-4", confidence: 0.7, impact: 0.8, cost: 0.3, risk: 0.2 },
  { id: "swap-injector-4", confidence: 0.5, impact: 0.7, cost: 0.5, risk: 0.3 },
];

describe("calibration math", () => {
  it("computes empirical success with partial as half-credit", () => {
    expect(
      empiricalSuccessRate(
        bucket({ actionId: "a", faultClass: "C", worked: 2, partial: 2, failed: 0 }),
      ),
    ).toEqual({ rate: 0.75, n: 4 });
  });

  it("shrinks toward prior when n is small", () => {
    // prior 0.7, empirical 1.0, n=1, k=2 → (1*1 + 2*0.7)/3 = 0.8
    expect(shrinkTowardPrior(0.7, 1, 1, 2)).toBeCloseTo(0.8, 5);
  });

  it("moves farther from prior when n is large", () => {
    const small = shrinkTowardPrior(0.5, 1, 1, 2);
    const large = shrinkTowardPrior(0.5, 1, 10, 2);
    expect(large).toBeGreaterThan(small);
  });
});

describe("calibratePlaybook", () => {
  it("raises action confidence when vehicle history shows clean successes", () => {
    const cal = calibratePlaybook({
      faultClass: "MisfireUnderLoad",
      actions,
      urgency: "high",
      history: history([
        bucket({
          actionId: "swap-coil-4",
          faultClass: "MisfireUnderLoad",
          worked: 3,
          failed: 0,
          totalWithOutcome: 3,
        }),
      ]),
    });
    const coil = cal.actions.find((a) => a.action.id === "swap-coil-4")!;
    expect(coil.calibratedConfidence).toBeGreaterThan(coil.priorConfidence);
    expect(coil.scope).toBe("vehicle");
    expect(cal.priority).toBe("critical"); // bumped from high
    expect(cal.explain).toMatch(/worked 3\/3/);
  });

  it("stays near prior with a single outcome", () => {
    const cal = calibratePlaybook({
      faultClass: "MisfireUnderLoad",
      actions,
      history: history([
        bucket({
          actionId: "swap-coil-4",
          faultClass: "MisfireUnderLoad",
          worked: 1,
          totalWithOutcome: 1,
        }),
      ]),
    });
    const coil = cal.actions.find((a) => a.action.id === "swap-coil-4")!;
    expect(coil.calibratedConfidence).toBeCloseTo(0.8, 2); // (1*1 + 2*0.7)/3
    expect(cal.priority).toBe("normal"); // no bump (need worked≥2)
  });

  it("uses cartridge prior when there is no history", () => {
    const cal = calibratePlaybook({
      faultClass: "MisfireUnderLoad",
      actions,
      history: history([]),
    });
    expect(cal.actions.every((a) => a.scope === "prior")).toBe(true);
    expect(cal.actions[0]?.calibratedConfidence).toBe(0.7);
  });
});
