import { FakeLogosBridge } from "@auto/logos-bridge";
import { describe, expect, it } from "vitest";
import { PolicyService } from "./policy.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("PolicyService", () => {
  it("does not forbid clear-codes-and-drive when nothing dangerous is proven", async () => {
    const policy = new PolicyService(new FakeLogosBridge());
    const evaluation = await policy.evaluate(JEEP, []);
    expect(policy.isActionForbidden(evaluation, "clear-codes-and-drive")).toEqual({
      forbidden: false,
    });
  });

  it("forbids clear-codes-and-drive when MisfireUnderLoad is proven (real safety hold, not a UI suggestion)", async () => {
    // FakeLogosBridge's default reasoner derives nothing — inject one that
    // actually fires the rule, to test PolicyService's own wiring (sanitizing
    // ids, matching the derived Forbid(...) formula), not LOGOS's fixpoint.
    const bridge = new FakeLogosBridge(undefined, undefined, undefined, undefined, (input) => {
      const misfire = input.facts.some((f) => f.formula.startsWith("MisfireUnderLoad("));
      return {
        derived: misfire
          ? [
              {
                formula: "Forbid(ClearCodesAndDrive(veh_jeep_renegade_2015_latitude))",
                ruleId: "R_forbid_clear_misfire",
                facts: [],
                confidence: 0.9,
              },
              {
                formula: "Ought(StopDrivingAndDiagnose(veh_jeep_renegade_2015_latitude))",
                ruleId: "R_ought_stop_misfire",
                facts: [],
                confidence: 0.9,
              },
            ]
          : [],
        resolutions: [],
        unresolved: [],
        defeated: [],
        unsafe: [],
        realized: [],
        rounds: 1,
        fixpoint: true,
        realizationNote: null,
        realizationUndecided: [],
      };
    });
    const policy = new PolicyService(bridge);
    const evaluation = await policy.evaluate(JEEP, ["MisfireUnderLoad"]);
    const check = policy.isActionForbidden(evaluation, "clear-codes-and-drive");
    expect(check.forbidden).toBe(true);
    expect(evaluation.obligations).toContain(
      "Ought(StopDrivingAndDiagnose(veh_jeep_renegade_2015_latitude))",
    );
  });

  it("sanitizes hyphen/colon vehicle ids into FOL-safe atoms before calling reason", async () => {
    let sentFormula = "";
    const bridge = new FakeLogosBridge(undefined, undefined, undefined, undefined, (input) => {
      sentFormula = input.facts[0]?.formula ?? "";
      return {
        derived: [],
        resolutions: [],
        unresolved: [],
        defeated: [],
        unsafe: [],
        realized: [],
        rounds: 1,
        fixpoint: true,
        realizationNote: null,
        realizationUndecided: [],
      };
    });
    const policy = new PolicyService(bridge);
    await policy.evaluate(JEEP, ["MisfireUnderLoad"]);
    expect(sentFormula).toBe("MisfireUnderLoad(veh_jeep_renegade_2015_latitude)");
  });
});
