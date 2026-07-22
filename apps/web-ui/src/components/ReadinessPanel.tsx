import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

/**
 * UX4 thin readiness — surface I/M monitor honesty without inventing smog-ready.
 * Full complete/incomplete tiles wait on Mode 01 PID $01 STATUS capture.
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
      {data && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            {data.status === "unsupported" ? "Not captured yet" : data.status}
          </p>
          <p className="mt-1 text-sm text-slate-600">{data.message}</p>
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            required PID: {data.requiredPid}
          </p>
        </div>
      )}
    </section>
  );
}
