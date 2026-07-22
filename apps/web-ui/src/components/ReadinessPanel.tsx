import type { ImReadiness } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

/**
 * UX4 I/M readiness — Mode 01 PID $01 STATUS when captured; never invents
 * smog-ready from empty DTCs.
 */
export function ReadinessPanel({ vehicleId }: { vehicleId: string }) {
  const readinessQ = useQuery({
    queryKey: queryKeys.readiness(vehicleId),
    queryFn: () => api.getReadiness(vehicleId),
  });

  const data = readinessQ.data;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">I/M readiness</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Monitor completion (Mode 01 PID $01) — not inferred from empty DTCs.
      </p>
      {readinessQ.isLoading && <p className="mt-3 text-sm text-slate-400">Loading…</p>}
      {readinessQ.isError && (
        <p className="mt-3 text-sm text-rose-700">Could not load readiness.</p>
      )}
      {data && <ReadinessBody data={data} />}
    </section>
  );
}

function ReadinessBody({ data }: { data: ImReadiness }) {
  const tone =
    data.status === "complete"
      ? "text-emerald-800"
      : data.status === "incomplete"
        ? "text-amber-800"
        : "text-slate-600";

  return (
    <div className="mt-3">
      <p className={`text-xs font-medium uppercase tracking-wide ${tone}`}>
        {statusLabel(data.status)}
        {data.mil ? " · MIL on" : ""}
      </p>
      <p className="mt-1 text-sm text-slate-600">{data.message}</p>
      {data.monitors && data.monitors.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {data.monitors.map((m) => (
            <li
              key={m.name}
              className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs"
            >
              <span className="truncate text-slate-600">{friendlyMonitor(m.name)}</span>
              <span
                className={
                  m.complete ? "font-medium text-emerald-700" : "font-medium text-amber-700"
                }
              >
                {m.complete ? "complete" : "incomplete"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 font-mono text-[11px] text-slate-400">
        required PID: {data.requiredPid}
        {data.ignitionType ? ` · ignition: ${data.ignitionType}` : ""}
      </p>
    </div>
  );
}

function statusLabel(status: ImReadiness["status"]): string {
  switch (status) {
    case "complete":
      return "Monitors complete";
    case "incomplete":
      return "Monitors incomplete";
    case "no_data":
      return "No STATUS on file";
    default:
      return "Not captured yet";
  }
}

function friendlyMonitor(name: string): string {
  return name
    .replace(/_MONITORING$/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
