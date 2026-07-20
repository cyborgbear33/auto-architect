import { lookupDtc, lookupMode06 } from "@auto/ontology";
import type { DtcObservation, Mode06Result } from "@auto/semantic-types";
import type { AboxAssertions, Cartridge, PerceptionRule } from "./types.ts";

const ROLE_FOR: Record<PerceptionRule["as"], "hasDtc" | "hasCondition" | "hasTrend"> = {
  symptom: "hasDtc",
  condition: "hasCondition",
  trend: "hasTrend",
};

function evaluate(when: PerceptionRule["when"], value: number): boolean {
  if (!when) return true;
  if (when.gt !== undefined && !(value > when.gt)) return false;
  if (when.gte !== undefined && !(value >= when.gte)) return false;
  if (when.lt !== undefined && !(value < when.lt)) return false;
  if (when.lte !== undefined && !(value <= when.lte)) return false;
  return true;
}

/** Active-DTC Symptom concepts present right now (status stored or pending), by dictionary lookup. */
function activeDtcConcepts(dtcs: DtcObservation[]): Set<string> {
  const concepts = new Set<string>();
  for (const dtc of dtcs) {
    if (dtc.status === "permanent") continue; // permanent alone doesn't imply "currently active"
    const entry = lookupDtc(dtc.code);
    if (entry) concepts.add(entry.concept);
  }
  return concepts;
}

/** Condition concepts from failed Mode 06 monitors that have a dictionary mapping. */
function failedMode06Concepts(mode06: Mode06Result[]): Set<string> {
  const concepts = new Set<string>();
  for (const row of mode06) {
    if (row.passed !== false) continue;
    const entry = lookupMode06(row.mid);
    if (entry?.concept) concepts.add(entry.concept);
  }
  return concepts;
}

/**
 * Run every registered cartridge's perception rules over a vehicle's latest
 * DTCs + PID readings + Mode 06 results, producing the ABox `realize`
 * classifies. This is the one place raw OBD-II numbers/codes become proven
 * ABox facts — thresholds and monitor meanings live here / in dictionaries,
 * never as invented UI badges.
 */
export function runPerception(
  vehicleId: string,
  dtcs: DtcObservation[],
  pids: Record<string, number>,
  cartridges: Cartridge[],
  mode06: Mode06Result[] = [],
): AboxAssertions {
  const concepts: Record<string, string[]> = { [vehicleId]: ["Engine"] };
  const roles: Array<[string, string, string]> = [];
  const active = activeDtcConcepts(dtcs);
  const failedMonitors = failedMode06Concepts(mode06);

  for (const cartridge of cartridges) {
    for (const rule of cartridge.perception) {
      let satisfied = false;
      if (rule.dtcConcept !== undefined) {
        satisfied = active.has(rule.dtcConcept);
      } else if (rule.pid !== undefined) {
        const value = pids[rule.pid];
        satisfied = value !== undefined && evaluate(rule.when, value);
      } else if (rule.mode06Concept !== undefined) {
        satisfied = failedMonitors.has(rule.mode06Concept);
      }
      if (!satisfied) continue;

      const individual = `${vehicleId}:${rule.slot}`;
      concepts[individual] = [rule.concept];
      roles.push([ROLE_FOR[rule.as], vehicleId, individual]);
    }
  }

  return { concepts, roles };
}

/** DTC codes any registered cartridge's perception rules actually key off of (for docs/lint). */
export function perceivedDtcConcepts(cartridges: Cartridge[]): string[] {
  const out = new Set<string>();
  for (const c of cartridges) for (const r of c.perception) if (r.dtcConcept) out.add(r.dtcConcept);
  return [...out];
}

/** Mode 06 Condition concepts cartridges perceive (for docs/lint). */
export function perceivedMode06Concepts(cartridges: Cartridge[]): string[] {
  const out = new Set<string>();
  for (const c of cartridges) {
    for (const concept of c.requires.mode06Concepts ?? []) out.add(concept);
    for (const r of c.perception) if (r.mode06Concept) out.add(r.mode06Concept);
  }
  return [...out];
}
