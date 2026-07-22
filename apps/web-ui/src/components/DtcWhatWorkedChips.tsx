import type { ClassEvidence } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import {
  faultClassForDtc,
  smallNAdvisory,
  summarizeBucket,
  topWorkedBuckets,
} from "./solutionHistoryUi.ts";

/**
 * Compact “verified fix” adjacency on Dashboard DTC rows (UX2).
 * Joins code → proven class via classEvidence, then solution-history — never invents.
 */
export function DtcWhatWorkedChips({
  vehicleId,
  dtcCode,
  classEvidence,
}: {
  vehicleId: string;
  dtcCode: string;
  classEvidence: ClassEvidence[] | undefined;
}) {
  const faultClass = faultClassForDtc(dtcCode, classEvidence);
  const historyQ = useQuery({
    queryKey: queryKeys.solutionHistory(vehicleId, faultClass),
    queryFn: () => api.getSolutionHistory(vehicleId, faultClass),
    enabled: Boolean(faultClass),
  });

  if (!faultClass) return null;
  if (historyQ.isLoading) {
    return <p className="mt-1 text-[11px] text-slate-400">Checking prior fixes…</p>;
  }
  if (!historyQ.data) return null;

  const tops = topWorkedBuckets(historyQ.data, 2);
  if (tops.length === 0) {
    return (
      <p className="mt-1 text-[11px] text-slate-400">No confirmed fixes for {faultClass} yet</p>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {tops.map((b) => {
        const advisory = smallNAdvisory(b);
        return (
          <span
            key={`${b.scope}:${b.actionId}`}
            title={[summarizeBucket(b), advisory].filter(Boolean).join(" · ")}
            className="inline-flex max-w-full items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900"
          >
            <span className="font-semibold uppercase tracking-wide text-emerald-700">Worked</span>
            <span className="truncate font-mono">{b.actionId}</span>
            <span className="text-emerald-700/80">n={b.totalWithOutcome}</span>
          </span>
        );
      })}
    </div>
  );
}
