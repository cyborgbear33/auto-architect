import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DataExportPanel } from "../components/DataExportPanel.tsx";
import { KnowledgeGapPanel } from "../components/KnowledgeGapPanel.tsx";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";

const OUTCOME_STYLES: Record<string, string> = {
  worked: "bg-green-100 text-green-800 border-green-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  inconclusive: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}

export function Journal() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleJournal vehicleId={vehicleId} />;
}

function VehicleJournal({ vehicleId }: { vehicleId: string }) {
  const decisionsQ = useQuery({
    queryKey: queryKeys.decisions(vehicleId),
    queryFn: () => api.listDecisions(vehicleId),
  });

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="Repairs you logged: what you did, why, and whether it worked."
      />

      <div className="mb-4">
        <DataExportPanel vehicleId={vehicleId} />
      </div>

      <div className="mb-4">
        <KnowledgeGapPanel vehicleId={vehicleId} compact />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Logged repairs</h2>
        {decisionsQ.isLoading && <p className="text-sm text-slate-400">Loading journal…</p>}
        {decisionsQ.isError && (
          <p role="alert" className="text-sm text-red-700">
            Could not load the journal. Check that the API is running, then refresh.
          </p>
        )}
        {decisionsQ.data?.length === 0 && (
          <p className="text-sm text-slate-500">
            No repairs logged yet. Record an outcome from a case when you finish a repair.
          </p>
        )}
        <ul className="space-y-3">
          {decisionsQ.data?.map((d) => (
            <li key={d.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <Link
                  to="/problems/$problemId"
                  params={{ problemId: d.problemId }}
                  className="font-semibold text-slate-800 hover:underline"
                >
                  {d.actionId}
                </Link>
                {d.outcome && (
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[d.outcome.status] ?? OUTCOME_STYLES.inconclusive}`}
                  >
                    {d.outcome.status}
                  </span>
                )}
              </div>
              <p className="mt-1 text-slate-600">{d.rationale}</p>
              <p className="mt-1 text-xs text-slate-400">
                {d.decidedBy} · {formatWhen(d.decidedAt)} ·{" "}
                {d.policyAllowed ? "policy allowed this action" : "policy blocked this action"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
