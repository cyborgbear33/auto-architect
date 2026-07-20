/**
 * Compose supporting evidence for a proven fault class from cartridge
 * requires + current observations. Never invents classes — caller only
 * passes names from realize `mostSpecific`.
 */
import { lookupDtc, lookupMode06, lookupPid } from "@auto/ontology";
import type { DtcObservation, FreezeFrame, Mode06Result } from "@auto/semantic-types";
import type { Cartridge } from "./types.ts";

export interface ClassEvidencePid {
  pid: string;
  value: number;
  unit?: string;
  /** True when a perception `when` rule for this PID is currently met. */
  thresholdMet?: boolean;
}

export interface ClassEvidenceBundle {
  className: string;
  dtcs: DtcObservation[];
  pids: ClassEvidencePid[];
  freezeFrames: FreezeFrame[];
  mode06: Mode06Result[];
}

function pidMeetsWhen(
  value: number,
  when?: { gt?: number; gte?: number; lt?: number; lte?: number },
): boolean {
  if (!when) return true;
  if (when.gt !== undefined && !(value > when.gt)) return false;
  if (when.gte !== undefined && !(value >= when.gte)) return false;
  if (when.lt !== undefined && !(value < when.lt)) return false;
  if (when.lte !== undefined && !(value <= when.lte)) return false;
  return true;
}

/** Cartridges that frame or require this proven class. */
export function cartridgesForClass(className: string, cartridges: Cartridge[]): Cartridge[] {
  return cartridges.filter(
    (c) =>
      c.framing.some((f) => f.whenClass === className) || c.requires.classes.includes(className),
  );
}

export function composeClassEvidence(
  className: string,
  cartridges: Cartridge[],
  dtcs: DtcObservation[],
  pids: Record<string, number>,
  freezeFrames: FreezeFrame[],
  mode06: Mode06Result[] = [],
): ClassEvidenceBundle {
  const supporting = cartridgesForClass(className, cartridges);
  const dtcConcepts = new Set<string>();
  const mode06Concepts = new Set<string>();
  const pidKeys = new Set<string>();
  const pidWhen = new Map<string, { gt?: number; gte?: number; lt?: number; lte?: number }>();

  for (const c of supporting) {
    for (const concept of c.requires.dtcConcepts ?? []) dtcConcepts.add(concept);
    for (const concept of c.requires.mode06Concepts ?? []) mode06Concepts.add(concept);
    for (const pid of c.requires.pids ?? []) pidKeys.add(pid);
    for (const rule of c.perception) {
      if (rule.dtcConcept) dtcConcepts.add(rule.dtcConcept);
      if (rule.mode06Concept) mode06Concepts.add(rule.mode06Concept);
      if (rule.pid) {
        pidKeys.add(rule.pid);
        if (rule.when) pidWhen.set(rule.pid, rule.when);
      }
    }
  }

  const supportingDtcs = dtcs.filter((d) => {
    if (d.status === "permanent") return false;
    const concept = lookupDtc(d.code)?.concept;
    return concept !== undefined && dtcConcepts.has(concept);
  });

  const supportingCodes = new Set(supportingDtcs.map((d) => d.code.toUpperCase()));
  const supportingFfs = freezeFrames.filter((ff) => supportingCodes.has(ff.dtc.toUpperCase()));

  const supportingPids: ClassEvidencePid[] = [];
  for (const pid of [...pidKeys].sort()) {
    const value = pids[pid];
    if (value === undefined) continue;
    const when = pidWhen.get(pid);
    const entry = lookupPid(pid);
    supportingPids.push({
      pid,
      value,
      ...(entry?.unit ? { unit: entry.unit } : {}),
      ...(when ? { thresholdMet: pidMeetsWhen(value, when) } : {}),
    });
  }

  const supportingMode06 = mode06.filter((row) => {
    const concept = lookupMode06(row.mid)?.concept;
    return concept !== undefined && mode06Concepts.has(concept);
  });

  return {
    className,
    dtcs: supportingDtcs,
    pids: supportingPids,
    freezeFrames: supportingFfs,
    mode06: supportingMode06,
  };
}

export function composeAllClassEvidence(
  classNames: string[],
  cartridges: Cartridge[],
  dtcs: DtcObservation[],
  pids: Record<string, number>,
  freezeFrames: FreezeFrame[],
  mode06: Mode06Result[] = [],
): ClassEvidenceBundle[] {
  return classNames.map((className) =>
    composeClassEvidence(className, cartridges, dtcs, pids, freezeFrames, mode06),
  );
}
