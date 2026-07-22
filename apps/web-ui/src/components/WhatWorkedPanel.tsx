import type { SolutionRollupBucket } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import { smallNAdvisory, summarizeBucket } from "./solutionHistoryUi.ts";

function BucketList({
  title,
  buckets,
  empty,
}: {
  title: string;
  buckets: SolutionRollupBucket[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {buckets.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {buckets.slice(0, 6).map((b) => {
            const advisory = smallNAdvisory(b);
            return (
              <li
                key={`${b.scope}:${b.actionId}:${b.faultClass ?? ""}`}
                className="rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-800">{b.actionId}</span>
                  <span className="text-xs text-slate-500">{summarizeBucket(b)}</span>
                </div>
                {b.faultClass && (
                  <p className="mt-0.5 text-xs text-slate-500">for {b.faultClass}</p>
                )}
                {advisory && <p className="mt-0.5 text-[11px] text-amber-700">{advisory}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Confirmed-fix memory from log-repair outcomes — read-only, never invents classes. */
export function WhatWorkedPanel({
  vehicleId,
  faultClass,
}: {
  vehicleId: string;
  faultClass?: string | null;
}) {
  const historyQ = useQuery({
    queryKey: queryKeys.solutionHistory(vehicleId, faultClass ?? undefined),
    queryFn: () => api.getSolutionHistory(vehicleId, faultClass ?? undefined),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">
        What worked before
        {faultClass ? ` · ${faultClass}` : ""}
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        From logged repair outcomes on this vehicle and its engine family. Small samples stay
        advisory — they do not invent fault classes.
      </p>
      {historyQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {historyQ.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BucketList
            title="This vehicle"
            buckets={historyQ.data.vehicle}
            empty="No confirmed outcomes logged for this vehicle yet."
          />
          <BucketList
            title={`${historyQ.data.engineFamily} family`}
            buckets={historyQ.data.engineFamilyRollup}
            empty="No family outcomes yet."
          />
        </div>
      )}
    </section>
  );
}
