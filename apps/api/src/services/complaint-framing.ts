/**
 * H6 — enrich cartridge framing with operator complaints.
 * Propose/dispose: appends to statement + causal symptoms only; never invents realize classes.
 */
import type { CausalModel, ProblemStatement } from "@auto/semantic-types";

export function normalizeComplaints(raw: string[] | undefined | null): string[] {
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const t = c.trim().replace(/\s+/g, " ");
    if (!t || t.length > 200) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

export function enrichFramingWithComplaints(
  statement: ProblemStatement,
  causalModel: CausalModel,
  complaints: string[],
): { statement: ProblemStatement; causalModel: CausalModel } {
  if (complaints.length === 0) return { statement, causalModel };
  const report = `Operator reports: ${complaints.join("; ")}.`;
  const base = statement.currentState.trim();
  const currentState = base ? `${base} ${report}` : report;
  const symptoms = [...(causalModel.symptoms ?? [])];
  for (const c of complaints) {
    const tagged = `operator: ${c}`;
    if (!symptoms.some((s) => s.toLowerCase() === tagged.toLowerCase())) {
      symptoms.push(tagged);
    }
  }
  return {
    statement: { ...statement, currentState },
    causalModel: { ...causalModel, symptoms },
  };
}
