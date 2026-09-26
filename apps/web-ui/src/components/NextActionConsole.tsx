import type { ClassNarration, DiagnosticProblem, Recommendation } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import { useAppSelector } from "../store/index.ts";

const ACTIVE: ReadonlySet<DiagnosticProblem["status"]> = new Set([
  "open",
  "analyzing",
  "verifying",
]);

const PRIORITY_RANK: Record<Recommendation["priority"], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function pickTopRec(recs: Recommendation[]): Recommendation | undefined {
  return [...recs].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
}

/** Prefer operator-facing narration; fall back to the class id. */
export function fluentForClass(className: string, narration: ClassNarration[] | undefined): string {
  const hit = narration?.find((n) => n.className === className);
  if (hit?.fluent?.trim() && hit.fluent !== className) return hit.fluent.trim();
  return className;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export type DashboardCta = { label: string; to: "/diagnosis" | "/guide" };

/** One justified next step for the Dashboard header. */
export function dashboardDecision(input: {
  loading: boolean;
  hasEvidence: boolean;
  provenFluent: string[];
  topRecTitle?: string;
  topRecReason?: string;
  topRecPlaybook?: string;
  activeCaseCount: number;
}): { headline: string; detail: string; primary: DashboardCta | null } {
  if (input.loading) {
    return {
      headline: "Assessing vehicle state…",
      detail: "Checking what is proven and what to do next.",
      primary: null,
    };
  }
  const proven = input.provenFluent;
  if (!input.hasEvidence && proven.length === 0) {
    return {
      headline: "Nothing is classified yet",
      detail:
        "No OBD evidence is on file, so there is nothing to classify. Empty is not a clean bill of health. The Guide walks through a live scan.",
      primary: { label: "How to scan", to: "/guide" },
    };
  }
  if (proven.length === 0) {
    return {
      headline: "Nothing is classified yet",
      detail:
        "Evidence is on file, and nothing is confirmed from it. That is honest uncertainty, not a clean bill of health.",
      primary: { label: "Review Diagnosis", to: "/diagnosis" },
    };
  }
  if (input.topRecTitle) {
    const why = input.topRecReason?.trim();
    const narrLead = proven[0];
    const detail = why
      ? narrLead && narrLead !== input.topRecTitle
        ? `${why} (${clip(narrLead, 100)})`
        : why
      : clip(input.topRecPlaybook || narrLead || "Open recommendation ready on Diagnosis.", 220);
    return {
      headline: `Next: ${input.topRecTitle}`,
      detail,
      primary: { label: "Take this next", to: "/diagnosis" },
    };
  }
  if (input.activeCaseCount > 0) {
    const noun = input.activeCaseCount === 1 ? "case is" : "cases are";
    return {
      headline: `${input.activeCaseCount} open ${noun} waiting`,
      detail: `${clip(proven.join("; "), 160)} Continue that work on Diagnosis.`,
      primary: { label: "Open the case", to: "/diagnosis" },
    };
  }
  return {
    headline:
      proven.length === 1
        ? `Proven: ${clip(proven[0] ?? "", 80)}`
        : `${proven.length} conditions are proven`,
    detail: `${clip(proven.join("; "), 180)} Draft a case before ranking a repair.`,
    primary: { label: "Draft the case", to: "/diagnosis" },
  };
}

export function useDashboardDecision(vehicleId: string) {
  const recognitionQ = useQuery({
    queryKey: queryKeys.recognition(vehicleId),
    queryFn: () => api.getRecognition(vehicleId),
  });
  const recsQ = useQuery({
    queryKey: queryKeys.recommendations(vehicleId),
    queryFn: () => api.getRecommendations(vehicleId, { openOnly: true }),
  });
  const problemsQ = useQuery({
    queryKey: queryKeys.problems(vehicleId),
    queryFn: () => api.listProblems(vehicleId),
  });
  const provenanceQ = useQuery({
    queryKey: queryKeys.evidenceProvenance(vehicleId),
    queryFn: () => api.getEvidenceProvenance(vehicleId),
  });

  const proven = recognitionQ.data?.mostSpecific ?? [];
  const narration = recognitionQ.data?.narration;
  const topRec = pickTopRec(recsQ.data ?? []);
  const activeCases = (problemsQ.data ?? []).filter((p) => ACTIVE.has(p.status));
  const loading = recognitionQ.isLoading || recsQ.isLoading || problemsQ.isLoading;
  const decision = dashboardDecision({
    loading,
    hasEvidence: (provenanceQ.data?.batchCount ?? 0) > 0,
    provenFluent: proven.map((cls) => fluentForClass(cls, narration)),
    topRecTitle: topRec?.title,
    topRecReason: topRec?.reason,
    topRecPlaybook: topRec?.aemfPlaybook,
    activeCaseCount: activeCases.length,
  });

  const supportingCodes = [
    ...new Set(
      (recognitionQ.data?.classEvidence ?? [])
        .filter((entry) => proven.includes(entry.className))
        .flatMap((entry) => entry.dtcs.map((dtc) => dtc.code)),
    ),
  ];

  return { decision, proven, narration, supportingCodes };
}

/**
 * Why the header's one action is the action. The button itself lives in the
 * Dashboard header so Guide, report, and refresh stay secondary.
 */
export function NextActionConsole({ vehicleId }: { vehicleId: string }) {
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const { decision, proven, supportingCodes } = useDashboardDecision(vehicleId);

  return (
    <section
      className="mb-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-4 shadow-sm"
      aria-labelledby="next-action-heading"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-300">
        Why this step
      </p>
      <h2 id="next-action-heading" className="mt-1 text-lg font-semibold text-white">
        {decision.headline}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-300">{decision.detail}</p>
      {supportingCodes.length > 0 && (
        <p className="mt-2 text-xs text-slate-300">Named by {supportingCodes.join(", ")}.</p>
      )}
      {debugMode && proven.length > 0 && (
        <p className="mt-2 font-mono text-[10px] text-slate-400">{proven.join(", ")}</p>
      )}
    </section>
  );
}
