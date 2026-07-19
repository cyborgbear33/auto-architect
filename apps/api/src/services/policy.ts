import type { LogosBridge, ReasonResult, ReasonRule } from "@auto/logos-bridge";
import { mapBridgeError } from "../lib/bridge-errors.ts";

/**
 * Declarative safety holds: proven fault classes → obligations (`Ought(...)`)
 * and forbidden actions (`Forbid(...)`). This is a real policy gate, not a UI
 * suggestion — `ActionService` consults it BEFORE letting a "clear codes and
 * keep driving" request through. Add a row here (never a hardcoded
 * `if (class === "...")` in a route handler) to add a new safety hold.
 */
const SAFETY_RULES: ReasonRule[] = [
  { id: "R_forbid_clear_misfire", if: "MisfireUnderLoad(x)", then: "Forbid(ClearCodesAndDrive(x))", priority: 10 },
  { id: "R_ought_stop_misfire", if: "MisfireUnderLoad(x)", then: "Ought(StopDrivingAndDiagnose(x))", priority: 10 },
  {
    id: "R_forbid_clear_camcrank",
    if: "CamCrankCorrelationFault(x)",
    then: "Forbid(ClearCodesAndDrive(x))",
    priority: 10,
  },
  {
    id: "R_ought_stop_camcrank",
    if: "CamCrankCorrelationFault(x)",
    then: "Ought(StopDrivingAndDiagnose(x))",
    priority: 10,
  },
  {
    id: "R_forbid_clear_oilstarvation",
    if: "MultiAirOilStarvation(x)",
    then: "Forbid(ClearCodesAndDrive(x))",
    priority: 10,
  },
  {
    id: "R_ought_oil_precheck",
    if: "MultiAirOilStarvation(x)",
    then: "Ought(CheckOilBeforeMultiAirActuator(x))",
    priority: 10,
  },
  {
    id: "R_ought_schedule_evap_small",
    if: "EvapLeakSmall(x)",
    then: "Ought(ScheduleServiceSoon(x))",
    priority: 1,
  },
  {
    id: "R_ought_schedule_evap_large",
    if: "EvapLeakLarge(x)",
    then: "Ought(ScheduleServiceSoon(x))",
    priority: 1,
  },
];

/** Action tags a route/UI can ask `isActionForbidden` about, mapped to their reason-rule formula name. */
const ACTION_FORMULAS: Record<string, string> = {
  "clear-codes-and-drive": "ClearCodesAndDrive",
};

export interface PolicyEvaluation {
  vehicleId: string;
  obligations: string[];
  forbidden: Array<{ action: string; reason: string }>;
  reasonResult: ReasonResult;
}

/**
 * LOGOS's `reason` grammar parses formulas as text, and its constant-name
 * tokenizer does not accept `-`/`:` (unlike `realize`, whose ABox individuals
 * are plain JSON dict keys, never re-parsed as text). Auto-architect's
 * semantic ids (`veh:jeep-renegade-2015-latitude`) use both — sanitize before
 * building any `reason` formula. One-way (we already hold the real id in
 * `vehicleId`; we never need to recover it from the sanitized atom).
 */
function folSafeAtom(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

export class PolicyService {
  constructor(private bridge: LogosBridge) {}

  /** Evaluate safety holds for a vehicle's currently-proven fault classes. */
  async evaluate(vehicleId: string, provenClasses: string[]): Promise<PolicyEvaluation> {
    const atom = folSafeAtom(vehicleId);
    const facts = provenClasses.map((c) => ({ formula: `${c}(${atom})`, confidence: 0.9 }));
    let reasonResult: ReasonResult;
    try {
      reasonResult = await this.bridge.reason({ rules: SAFETY_RULES, facts, realize: false });
    } catch (err) {
      throw mapBridgeError(err);
    }

    const obligations = reasonResult.derived.filter((d) => d.formula.startsWith("Ought(")).map((d) => d.formula);
    const forbidden: PolicyEvaluation["forbidden"] = [];
    for (const [actionTag, formulaName] of Object.entries(ACTION_FORMULAS)) {
      const hit = reasonResult.derived.find((d) => d.formula === `Forbid(${formulaName}(${atom}))`);
      if (hit) forbidden.push({ action: actionTag, reason: `blocked by ${hit.ruleId}: ${hit.formula}` });
    }
    return { vehicleId, obligations, forbidden, reasonResult };
  }

  isActionForbidden(evaluation: PolicyEvaluation, actionTag: string): { forbidden: boolean; reason?: string } {
    const hit = evaluation.forbidden.find((f) => f.action === actionTag);
    return hit ? { forbidden: true, reason: hit.reason } : { forbidden: false };
  }
}
