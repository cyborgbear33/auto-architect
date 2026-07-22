import type { SolutionNarrativeCard, SolutionRollupBucket } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, queryKeys } from "../lib/api.ts";
import { smallNAdvisory, summarizeBucket } from "./solutionHistoryUi.ts";

function verifyLabel(v: SolutionNarrativeCard["verify"]): string {
  if (v === "none") return "not recorded";
  if (v === "pending") return "pending";
  return v;
}

function NarrativeList({ cards }: { cards: SolutionNarrativeCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No repair stories yet — log an outcome on a case to teach the next apprentice.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {cards.slice(0, 6).map((c) => (
        <li key={c.decisionId} className="rounded-md bg-slate-50 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-slate-800">{c.actionId}</span>
            <span className="text-xs text-slate-500">
              {c.outcome}
              {c.verify !== "none" ? ` · verify ${verifyLabel(c.verify)}` : ""}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {c.faultClass ?? "unscoped case"}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-slate-700">{c.lesson}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Why believed: {c.whyBelieved}{" "}
            <Link
              to="/problems/$problemId"
              params={{ problemId: c.problemId }}
              className="font-medium text-sky-700 hover:underline"
            >
              Open case
            </Link>
          </p>
        </li>
      ))}
    </ul>
  );
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
        Repair stories teach action → class → outcome → verify → why believed. Family rollups stay
        counts — small samples are advisory and never invent fault classes.
      </p>
      {historyQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {historyQ.data && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              This vehicle — stories
            </h3>
            <NarrativeList cards={historyQ.data.narratives ?? []} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BucketList
              title="This vehicle — counts"
              buckets={historyQ.data.vehicle}
              empty="No confirmed outcomes logged for this vehicle yet."
            />
            <BucketList
              title={`${historyQ.data.engineFamily} family`}
              buckets={historyQ.data.engineFamilyRollup}
              empty="No family outcomes yet."
            />
          </div>
        </div>
      )}
    </section>
  );
}
