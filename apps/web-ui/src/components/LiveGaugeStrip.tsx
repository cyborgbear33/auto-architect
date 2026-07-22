import {
  DEFAULT_LIVE_GAUGE_PIDS,
  LIVE_GAUGE_PID_CHOICES,
  MAX_LIVE_GAUGE_PIDS,
  type LiveGaugeReading,
  type LiveGaugeStrip as LiveGaugeStripData,
} from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";
import {
  loadGaugeLayout,
  resetGaugeLayout,
  saveGaugeLayout,
} from "../lib/gaugeLayoutPrefs.ts";

function formatValue(g: LiveGaugeReading): string {
  if (g.value === null || Number.isNaN(g.value)) return "—";
  const abs = Math.abs(g.value);
  if (abs >= 100) return g.value.toFixed(0);
  if (abs >= 10) return g.value.toFixed(1);
  return g.value.toFixed(1);
}

function formatUnit(unit: string | null): string {
  if (!unit) return "";
  if (unit === "percent") return "%";
  if (unit === "celsius") return "°C";
  if (unit === "rpm") return "rpm";
  return unit;
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return "no samples";
  if (ageMs < 1000) return "just now";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  return `${Math.round(ageMs / 60_000)}m ago`;
}

/**
 * Operate strip: operator-picked Mode 01 PIDs with units and staleness.
 * Layout persists per vehicle (local). Polls every 2s for watch-mode batches.
 */
export function LiveGaugeStrip({ vehicleId }: { vehicleId: string }) {
  const [pids, setPids] = useState(() => loadGaugeLayout(vehicleId));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPids(loadGaugeLayout(vehicleId));
    setEditing(false);
  }, [vehicleId]);

  const gaugesQ = useQuery({
    queryKey: queryKeys.liveGauges(vehicleId, pids),
    queryFn: () => api.getLiveGauges(vehicleId, pids),
    refetchInterval: 2_000,
  });

  const strip = gaugesQ.data;

  function togglePid(pid: string) {
    setPids((prev) => {
      if (prev.includes(pid)) {
        if (prev.length <= 1) return prev;
        const next = prev.filter((p) => p !== pid);
        return saveGaugeLayout(vehicleId, next);
      }
      if (prev.length >= MAX_LIVE_GAUGE_PIDS) return prev;
      return saveGaugeLayout(vehicleId, [...prev, pid]);
    });
  }

  function onReset() {
    setPids(resetGaugeLayout(vehicleId));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Live gauges</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Done" : "Customize"}
          </button>
          <FreshnessBadge strip={strip} loading={gaugesQ.isLoading} />
        </div>
      </div>

      {editing && (
        <div className="mb-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">
            Mode 01 PIDs only · up to {MAX_LIVE_GAUGE_PIDS} · saved for this vehicle
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LIVE_GAUGE_PID_CHOICES.map((pid) => {
              const on = pids.includes(pid);
              const atCap = !on && pids.length >= MAX_LIVE_GAUGE_PIDS;
              return (
                <button
                  key={pid}
                  type="button"
                  disabled={atCap}
                  onClick={() => togglePid(pid)}
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                    on
                      ? "border-sky-300 bg-sky-50 text-sky-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  }`}
                >
                  {pid}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
            onClick={onReset}
          >
            Reset to default ({DEFAULT_LIVE_GAUGE_PIDS.join(", ")})
          </button>
        </div>
      )}

      {gaugesQ.isLoading && !strip && <p className="text-sm text-slate-400">Loading…</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(strip?.gauges ?? emptyPlaceholders(pids)).map((g) => (
          <div
            key={g.pid}
            className={`min-w-0 border-l-2 pl-3 ${
              strip?.stale || g.value === null ? "border-slate-200" : "border-emerald-400"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {g.label}
            </p>
            <p
              className={`mt-0.5 font-mono text-2xl tabular-nums leading-none ${
                g.value === null ? "text-slate-300" : "text-slate-900"
              }`}
            >
              {formatValue(g)}
              {g.value !== null && g.unit && (
                <span className="ml-1 text-sm font-sans font-normal text-slate-500">
                  {formatUnit(g.unit)}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
      {strip?.stale && strip.capturedAt && (
        <p className="mt-3 text-xs text-amber-700">
          Values are stale ({formatAge(strip.ageMs)}). Run gateway{" "}
          <code className="rounded bg-amber-50 px-1">watch</code> or{" "}
          <code className="rounded bg-amber-50 px-1">scan</code> for fresh PIDs.
        </p>
      )}
      {!strip?.capturedAt && !gaugesQ.isLoading && (
        <p className="mt-3 text-xs text-slate-400">
          No PID samples yet — simulate a scan or connect the adapter.
        </p>
      )}
    </section>
  );
}

function FreshnessBadge({
  strip,
  loading,
}: {
  strip: LiveGaugeStripData | undefined;
  loading: boolean;
}) {
  if (loading && !strip) {
    return <span className="text-xs text-slate-400">…</span>;
  }
  if (!strip?.capturedAt) {
    return (
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
        No data
      </span>
    );
  }
  if (strip.stale) {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        Stale · {formatAge(strip.ageMs)}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
      Fresh · {formatAge(strip.ageMs)}
    </span>
  );
}

function emptyPlaceholders(pids: readonly string[]): LiveGaugeReading[] {
  return pids.map((pid) => ({
    pid,
    label: pid,
    value: null,
    unit: null,
    timestamp: null,
  }));
}
