import type { LiveGaugeReading, LiveGaugeStrip as LiveGaugeStripData } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

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
 * Operate strip: RPM / load / fuel trim / coolant with units and staleness.
 * Polls every 2s so watch-mode batches feel live (Doherty-friendly).
 */
export function LiveGaugeStrip({ vehicleId }: { vehicleId: string }) {
  const gaugesQ = useQuery({
    queryKey: queryKeys.liveGauges(vehicleId),
    queryFn: () => api.getLiveGauges(vehicleId),
    refetchInterval: 2_000,
  });

  const strip = gaugesQ.data;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Live gauges</h2>
        <FreshnessBadge strip={strip} loading={gaugesQ.isLoading} />
      </div>
      {gaugesQ.isLoading && !strip && <p className="text-sm text-slate-400">Loading…</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(strip?.gauges ?? emptyPlaceholders()).map((g) => (
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

function emptyPlaceholders(): LiveGaugeReading[] {
  return [
    { pid: "RPM", label: "RPM", value: null, unit: "rpm", timestamp: null },
    { pid: "ENGINE_LOAD", label: "Load", value: null, unit: "percent", timestamp: null },
    { pid: "SHORT_FUEL_TRIM_1", label: "STFT B1", value: null, unit: "percent", timestamp: null },
    { pid: "COOLANT_TEMP", label: "Coolant", value: null, unit: "celsius", timestamp: null },
  ];
}
