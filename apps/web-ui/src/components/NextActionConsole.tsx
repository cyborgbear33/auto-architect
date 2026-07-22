import type { DiagnosticProblem, Recommendation } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, queryKeys } from "../lib/api.ts";
import { AemfAspectChips } from "./AemfAspectChips.tsx";

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

/**
 * Dashboard “what now” strip — market apps (BlueDriver / FIXD) win on immediate
 * next-step clarity. We lead with proven classes + top recommendation without
 * turning Dashboard into a second Diagnosis page.
 */
export function NextActionConsole({ vehicleId }: { vehicleId: string }) {
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
  const topRec = pickTopRec(recsQ.data ?? []);
  const activeCases = (problemsQ.data ?? []).filter((p) => ACTIVE.has(p.status));
  const hasEvidence = (provenanceQ.data?.batchCount ?? 0) > 0;
  const loading = recognitionQ.isLoading || recsQ.isLoading || problemsQ.isLoading;

  let headline: string;
  let detail: string;
  let ctaLabel: string;
  let ctaTo: "/diagnosis" | "/guide" = "/diagnosis";

  if (loading) {
    headline = "Assessing vehicle state…";
    detail = "Loading recognition and open recommendations.";
    ctaLabel = "Open Diagnosis";
  } else if (!hasEvidence && proven.length === 0) {
    headline = "No OBD evidence on file yet";
    detail =
      "Import an OBD log or simulate a drive below — or follow the Guide for live MX+. Empty is not a clean bill of health.";
    ctaLabel = "How to scan (Guide)";
    ctaTo = "/guide";
  } else if (proven.length === 0) {
    headline = "Evidence present — nothing proven yet";
    detail =
      "LOGOS has not confirmed a fault class from current observations. That is honest uncertainty, not “healthy”.";
    ctaLabel = "Review Diagnosis";
  } else if (topRec) {
    headline = `Next: ${topRec.title}`;
    detail =
      topRec.aemfPlaybook?.slice(0, 180) ||
      topRec.reason ||
      "Open recommendation ready — convert to a case or continue on Diagnosis.";
    if (detail.length >= 180 && topRec.aemfPlaybook) detail = `${detail}…`;
    ctaLabel = "Open Diagnosis";
  } else if (activeCases.length > 0) {
    headline = `${activeCases.length} active diagnostic case${activeCases.length === 1 ? "" : "s"}`;
    detail = `Proven: ${proven.join(", ")}. Continue ranking, repair logging, or verify on Diagnosis.`;
    ctaLabel = "Open Diagnosis";
  } else {
    headline = `${proven.length} proven class${proven.length === 1 ? "" : "es"} — draft a case`;
    detail = `${proven.join(", ")}. Refresh recommendations or draft a diagnostic problem.`;
    ctaLabel = "Open Diagnosis";
  }

  return (
    <section
      className="mb-4 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-4 py-3"
      aria-labelledby="next-action-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            At a glance
          </p>
          <h2 id="next-action-heading" className="mt-0.5 text-base font-semibold text-slate-900">
            {headline}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{detail}</p>
          {proven.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {proven.slice(0, 3).map((cls) => (
                <span key={cls} className="inline-flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-slate-700">{cls}</span>
                  <AemfAspectChips className={cls} />
                </span>
              ))}
              {proven.length > 3 && (
                <span className="text-xs text-slate-400">+{proven.length - 3} more</span>
              )}
            </div>
          )}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <div>
              <dt className="inline font-medium text-slate-600">Proven </dt>
              <dd className="inline">{proven.length}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-600">Open recs </dt>
              <dd className="inline">{recsQ.data?.length ?? 0}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-600">Active cases </dt>
              <dd className="inline">{activeCases.length}</dd>
            </div>
          </dl>
        </div>
        <Link
          to={ctaTo}
          className="flex-shrink-0 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
