/**
 * Compose supporting evidence for a proven fault class from cartridge
 * requires + current observations. Never invents classes — caller only
 * passes names from realize `mostSpecific`.
 */
import { lookupDtc, lookupPid } from "@auto/ontology";
import type { DtcObservation, FreezeFrame } from "@auto/semantic-types";
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
): ClassEvidenceBundle {
  const supporting = cartridgesForClass(className, cartridges);
  const dtcConcepts = new Set<string>();
  const pidKeys = new Set<string>();
  const pidWhen = new Map<string, { gt?: number; gte?: number; lt?: number; lte?: number }>();

  for (const c of supporting) {
    for (const concept of c.requires.dtcConcepts ?? []) dtcConcepts.add(concept);
    for (const pid of c.requires.pids ?? []) pidKeys.add(pid);
    for (const rule of c.perception) {
      if (rule.dtcConcept) dtcConcepts.add(rule.dtcConcept);
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

  return {
    className,
    dtcs: supportingDtcs,
    pids: supportingPids,
    freezeFrames: supportingFfs,
  };
}

export function composeAllClassEvidence(
  classNames: string[],
  cartridges: Cartridge[],
  dtcs: DtcObservation[],
  pids: Record<string, number>,
  freezeFrames: FreezeFrame[],
): ClassEvidenceBundle[] {
  return classNames.map((className) =>
    composeClassEvidence(className, cartridges, dtcs, pids, freezeFrames),
  );
}
