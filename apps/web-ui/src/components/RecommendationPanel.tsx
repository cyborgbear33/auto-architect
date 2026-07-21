import type { Recommendation } from "@auto/semantic-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { api, queryKeys } from "../lib/api.ts";
import { CalibrationExplainChip } from "./Explainability.tsx";

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

function Pill({ children, tone = "normal" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCY_STYLES[tone] ?? URGENCY_STYLES.normal}`}
    >
      {children}
    </span>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function isCampaignRec(rec: Recommendation): boolean {
  return rec.source === "campaign" || (rec.generatedFromCampaignIds?.length ?? 0) > 0;
}

function isProcedureRec(rec: Recommendation): boolean {
  return rec.source === "procedure" || (rec.generatedFromProcedureIds?.length ?? 0) > 0;
}

function RecommendationCard({
  rec,
  onAccept,
  onDismiss,
  onConvert,
  busy,
}: {
  rec: Recommendation;
  onAccept: () => void;
  onDismiss: () => void;
  onConvert: () => void;
  busy: boolean;
}) {
  const campaign = isCampaignRec(rec);
  const procedure = isProcedureRec(rec);
  const faultClass = rec.generatedFromClasses[0];
  const campaignId = rec.generatedFromCampaignIds?.[0];
  const procedureId = rec.generatedFromProcedureIds?.[0];
  return (
    <li className="rounded-md bg-slate-50 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-800">{rec.title}</span>
            <Pill tone={rec.priority}>{rec.priority}</Pill>
            {campaign && (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                campaign
              </span>
            )}
            {procedure && (
              <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                procedure
              </span>
            )}
            <span className="text-[11px] uppercase tracking-wide text-slate-400">{rec.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{rec.reason}</p>
          {rec.calibrationExplain && (
            <CalibrationExplainChip explain={rec.calibrationExplain} meta={rec.calibrationMeta} />
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {rec.confidence !== undefined && <span>conf {pct(rec.confidence)}</span>}
            {rec.calibrationMeta && rec.calibrationMeta.sampleSize > 0 && (
              <span>
                n={rec.calibrationMeta.sampleSize} ({rec.calibrationMeta.scope})
              </span>
            )}
            {rec.cost !== undefined && <span>cost {pct(rec.cost)}</span>}
            {rec.risk !== undefined && <span>risk {pct(rec.risk)}</span>}
            {faultClass && <span className="font-mono text-slate-600">{faultClass}</span>}
            {campaignId && <span className="font-mono text-slate-600">{campaignId}</span>}
            {procedureId && <span className="font-mono text-slate-600">{procedureId}</span>}
            {!campaign && !procedure && (
              <a href="#evidence" className="font-medium text-sky-700 hover:underline">
                Evidence
              </a>
            )}
            {procedure ? (
              <Link to="/functions" className="font-medium text-sky-700 hover:underline">
                Functions
              </Link>
            ) : campaign ? (
              <Link to="/campaigns" className="font-medium text-sky-700 hover:underline">
                Campaigns
              </Link>
            ) : (
              <Link to="/diagnosis" className="font-medium text-sky-700 hover:underline">
                Diagnosis
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
          {rec.status !== "accepted" && (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Accept
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConvert}
            className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Convert to case
          </button>
        </div>
      </div>
    </li>
  );
}

/** Operator shortlist: class-backed + campaign/TSB cards with lifecycle actions. */
export function RecommendationPanel({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const recommendationsQ = useQuery({
    queryKey: queryKeys.recommendations(vehicleId),
    queryFn: () => api.getRecommendations(vehicleId, { openOnly: true }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.recommendations(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) });
  };

  const accept = useMutation({
    mutationFn: (id: string) => api.markRecommendationStatus(id, "accepted"),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.markRecommendationStatus(id, "dismissed"),
    onSuccess: invalidate,
  });
  const convert = useMutation({
    mutationFn: (id: string) => api.convertRecommendation(id),
    onSuccess: (result) => {
      invalidate();
      void navigate({
        to: "/problems/$problemId",
        params: { problemId: result.problem.id },
      });
    },
  });

  const busy = accept.isPending || dismiss.isPending || convert.isPending;
  const error =
    (accept.error ?? dismiss.error ?? convert.error)
      ? ((accept.error ?? dismiss.error ?? convert.error) as Error).message
      : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Recommendations</h2>
      <p className="mb-3 text-xs text-slate-400">
        Proven classes (with playbook cost/risk) plus matched OEM campaigns/TSBs. Campaign cards are
        applicability only — not a proven fault class.
      </p>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {recommendationsQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {recommendationsQ.data?.length === 0 && (
        <p className="text-sm text-slate-400">No open recommendations.</p>
      )}
      <ul className="space-y-2">
        {recommendationsQ.data?.map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            busy={busy}
            onAccept={() => accept.mutate(rec.id)}
            onDismiss={() => dismiss.mutate(rec.id)}
            onConvert={() => convert.mutate(rec.id)}
          />
        ))}
      </ul>
    </section>
  );
}
