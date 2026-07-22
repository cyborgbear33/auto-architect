import type { CausalBrief } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import { CausalModelPanel } from "./CausalModelPanel.tsx";

/**
 * A7 — apprentice causal brief: why / how we know / what to prove next,
 * plus AEMF, history notes, and the underlying CausalModel.
 */
export function CausalBriefPanel({
  vehicleId,
  faultClass,
  problemId,
}: {
  vehicleId: string;
  faultClass?: string;
  problemId?: string;
}) {
  const briefQ = useQuery({
    queryKey: problemId
      ? queryKeys.causalBriefProblem(problemId)
      : queryKeys.causalBriefClass(vehicleId, faultClass ?? ""),
    queryFn: () =>
      problemId
        ? api.getCausalBriefForProblem(problemId)
        : api.getCausalBriefForClass(vehicleId, faultClass!),
    enabled: Boolean(problemId || (vehicleId && faultClass)),
  });

  if (briefQ.isLoading) {
    return <p className="mt-2 text-xs text-slate-400">Loading causal brief…</p>;
  }
  if (briefQ.isError || !briefQ.data) {
    return null;
  }
  return <CausalBriefBody brief={briefQ.data} />;
}

export function CausalBriefBody({ brief }: { brief: CausalBrief }) {
  return (
    <section className="mt-3 rounded-lg border border-sky-100 bg-sky-50/40 p-4">
      <h2 className="text-sm font-semibold text-slate-800">Apprentice brief</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {brief.faultClass} — why it happens, how we know, what to prove next
      </p>

      <div className="mt-3 space-y-3 text-sm">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-800">Why</h3>
          <p className="mt-0.5 text-slate-700">{brief.why}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            How we know
          </h3>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-slate-700">
            {brief.howWeKnow.map((line) => (
              <li key={line.slice(0, 72)}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            What to prove next
          </h3>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-slate-700">
            {brief.whatToProveNext.map((line) => (
              <li key={line.slice(0, 72)}>{line}</li>
            ))}
          </ul>
        </div>
        {brief.aemfPlaybook && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              System media (AEMF)
            </h3>
            <p className="mt-0.5 text-slate-600">{brief.aemfPlaybook}</p>
          </div>
        )}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            This vehicle&apos;s history
          </h3>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-slate-600">
            {brief.historyNotes.map((line) => (
              <li key={line.slice(0, 72)}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <CausalModelPanel model={brief.causalModel} embedded />
      <p className="mt-2 text-[11px] text-slate-400">{brief.integrityNote}</p>
    </section>
  );
}
