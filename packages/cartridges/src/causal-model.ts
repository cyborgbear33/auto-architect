/**
 * A6 — compose DiagnosticProblem.causalModel from cartridge framing + live
 * classEvidence. Propose-only structure for apprentices / solve; never invents
 * realize membership or confirmed root causes.
 */
import type { CandidateAction, CausalModel } from "@auto/semantic-types";
import type { ClassEvidenceBundle } from "./class-evidence.ts";
import type { FramingResult } from "./types.ts";

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function actionCauseLabel(a: CandidateAction): string {
  return (a.description?.trim() || a.id).replace(/\s+/g, " ");
}

/** Symptoms observed now — evidence first, then framing currentState. */
export function symptomsFromEvidence(
  evidence: ClassEvidenceBundle | null | undefined,
  currentState: string,
): string[] {
  const fromEvidence: string[] = [];
  if (evidence) {
    for (const d of evidence.dtcs) {
      const desc = d.description?.trim();
      fromEvidence.push(desc ? `${d.code}: ${desc}` : d.code);
    }
    for (const p of evidence.pids) {
      const unit = p.unit ? ` ${p.unit}` : "";
      const met = p.thresholdMet === false ? " (threshold not met)" : "";
      fromEvidence.push(`${p.pid}=${p.value}${unit}${met}`);
    }
    for (const m of evidence.mode06) {
      if (m.passed === false) {
        fromEvidence.push(`Mode 06 MID ${m.mid} / TID ${m.tid} failed`);
      }
    }
  }
  const base = currentState.trim() ? [currentState.trim()] : [];
  return uniq([...fromEvidence, ...base]);
}

/** Fallback possible causes from playbook actions (skip pure stabilize). */
export function possibleCausesFromActions(actions: CandidateAction[]): string[] {
  return uniq(
    actions
      .filter((a) => !a.tags?.includes("stabilize"))
      .map(actionCauseLabel),
  );
}

export function mostLikelyCausesFromActions(actions: CandidateAction[], limit = 3): string[] {
  return uniq(
    [...actions]
      .filter((a) => !a.tags?.includes("stabilize"))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, limit)
      .map(actionCauseLabel),
  );
}

/**
 * Merge cartridge-authored causalModel (if any) with live evidence.
 * Authored lists win when non-empty; evidence always enriches symptoms.
 * `rootCauses` only when the cartridge authored them — never inferred.
 */
export function composeCausalModel(input: {
  draft: FramingResult;
  evidence?: ClassEvidenceBundle | null;
}): CausalModel {
  const { draft, evidence } = input;
  const authored = draft.causalModel;
  const evidenceSymptoms = symptomsFromEvidence(evidence, draft.statement.currentState);
  const symptoms = uniq([...(authored?.symptoms ?? []), ...evidenceSymptoms]);

  const possibleCauses =
    authored?.possibleCauses && authored.possibleCauses.length > 0
      ? uniq(authored.possibleCauses)
      : possibleCausesFromActions(draft.actions);

  const mostLikelyCauses =
    authored?.mostLikelyCauses && authored.mostLikelyCauses.length > 0
      ? uniq(authored.mostLikelyCauses)
      : mostLikelyCausesFromActions(draft.actions);

  const model: CausalModel = {
    symptoms,
    possibleCauses,
    mostLikelyCauses,
  };
  if (authored?.rootCauses?.length) model.rootCauses = uniq(authored.rootCauses);
  if (authored?.feedbackLoops?.length) model.feedbackLoops = uniq(authored.feedbackLoops);
  return model;
}
