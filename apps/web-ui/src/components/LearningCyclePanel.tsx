import type { LearningCycle } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, queryKeys } from "../lib/api.ts";

function cycleSummary(c: LearningCycle): string {
  const bits: string[] = [c.status];
  if (c.outcome) bits.push(`outcome ${c.outcome.status}`);
  if (c.priorDelta) {
    bits.push(`n=${c.priorDelta.sampleSize} (${c.priorDelta.scope})`);
  }
  return bits.join(" · ");
}

/** Thin status strip for epistemic learning cycles — not a second timeline. */
export function LearningCyclePanel({
  vehicleId,
  problemId,
  limit = 6,
}: {
  vehicleId: string;
  problemId?: string;
  limit?: number;
}) {
  const q = useQuery({
    queryKey: queryKeys.learningCycles(vehicleId, problemId),
    queryFn: () => api.getLearningCycles(vehicleId, problemId),
  });

  const cycles = (q.data?.cycles ?? []).slice(0, limit);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Learning cycles</h2>
      <p className="mb-3 text-xs text-slate-400">
        Evidence → decision → outcome → prior shift. Sample sizes are advisory — not probabilities.
      </p>
      {q.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {q.data && cycles.length === 0 && (
        <p className="text-sm text-slate-400">
          No cycles yet — solve or log a repair on a case to start one.
        </p>
      )}
      {cycles.length > 0 && (
        <ul className="space-y-1.5">
          {cycles.map((c) => (
            <li key={c.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">
                    {c.faultClass ?? "manual case"}
                  </span>
                  <p className="mt-0.5 text-xs text-slate-500">{cycleSummary(c)}</p>
                  {c.priorDelta?.explain && (
                    <p className="mt-0.5 text-[11px] text-violet-800">{c.priorDelta.explain}</p>
                  )}
                </div>
                <Link
                  to="/problems/$problemId"
                  params={{ problemId: c.id }}
                  className="shrink-0 text-xs font-medium text-sky-700 hover:underline"
                >
                  Open case
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
