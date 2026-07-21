import type { SolutionRollupBucket } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

function summarize(bucket: SolutionRollupBucket): string {
  const parts: string[] = [];
  if (bucket.worked) parts.push(`${bucket.worked} worked`);
  if (bucket.partial) parts.push(`${bucket.partial} partial`);
  if (bucket.failed) parts.push(`${bucket.failed} failed`);
  if (bucket.inconclusive) parts.push(`${bucket.inconclusive} inconclusive`);
  const base = parts.join(" · ") || "no outcomes";
  return `${base} · n=${bucket.totalWithOutcome}`;
}

function smallNAdvisory(bucket: SolutionRollupBucket): string | null {
  const n = bucket.totalWithOutcome;
  if (n === 0) return null;
  if (bucket.scope === "vehicle" && n < 2) return "Small sample (n<2) — advisory only";
  if (bucket.scope === "engineFamily" && n < 4) return "Small sample (n<4 family) — advisory only";
  return null;
}

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
                  <span className="text-xs text-slate-500">{summarize(b)}</span>
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
