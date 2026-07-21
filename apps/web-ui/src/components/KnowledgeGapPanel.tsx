import type { KnowledgeGapProposal } from "@auto/semantic-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

function KindPill({ kind }: { kind: KnowledgeGapProposal["kind"] }) {
  return (
    <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      {kind.replace(/_/g, " ")}
    </span>
  );
}

/** Knowledge-gap proposal queue — propose/dispose for ontology evolution. */
export function KnowledgeGapPanel({
  vehicleId,
  compact = false,
}: {
  vehicleId: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const gapsQ = useQuery({
    queryKey: queryKeys.knowledgeGaps(vehicleId),
    queryFn: () => api.getKnowledgeGaps(vehicleId, { openOnly: true }),
  });

  const refreshM = useMutation({
    mutationFn: () => api.refreshKnowledgeGaps(vehicleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.knowledgeGaps(vehicleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decisions(vehicleId) });
    },
  });

  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "dismissed" }) =>
      api.markKnowledgeGapStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.knowledgeGaps(vehicleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.decisions(vehicleId) });
    },
  });

  const exportM = useMutation({
    mutationFn: () => api.exportKnowledgeGaps(vehicleId),
    onSuccess: async (bundle) => {
      try {
        await navigator.clipboard.writeText(bundle.markdown);
      } catch {
        /* clipboard may be denied — still show markdown via alert fallback */
        window.prompt("Copy knowledge-gap export:", bundle.markdown);
      }
    },
  });

  const proposals = gapsQ.data ?? [];
  const busy = refreshM.isPending || statusM.isPending || exportM.isPending;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Knowledge gaps</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Propose ontology/dictionary improvements — accept exports a patch hint; never
            auto-writes the TBox.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => refreshM.mutate()}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => exportM.mutate()}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exportM.isSuccess ? "Copied export" : "Copy export"}
          </button>
        </div>
      </div>
      {gapsQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {gapsQ.data && proposals.length === 0 && (
        <p className="text-sm text-slate-400">
          No open gaps. Refresh after new observations or a reopen.
        </p>
      )}
      {proposals.length > 0 && (
        <ul className="space-y-2">
          {(compact ? proposals.slice(0, 4) : proposals).map((p) => (
            <li key={p.id} className="rounded-md bg-slate-50 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-800">{p.title}</span>
                    <KindPill kind={p.kind} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{p.rationale}</p>
                  {!compact && (
                    <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-white p-2 text-[11px] text-slate-600">
                      {p.proposedPatch.hint}
                    </pre>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => statusM.mutate({ id: p.id, status: "accepted" })}
                    className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => statusM.mutate({ id: p.id, status: "dismissed" })}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
