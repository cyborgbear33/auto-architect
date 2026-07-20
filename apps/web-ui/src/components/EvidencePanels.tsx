import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";

/** Mode 02 freeze-frame + Mode 06 monitor results already exposed by the API. */
export function EvidencePanels({ vehicleId }: { vehicleId: string }) {
  const ffQ = useQuery({
    queryKey: queryKeys.freezeFrames(vehicleId),
    queryFn: () => api.getFreezeFrames(vehicleId),
  });
  const mode06Q = useQuery({
    queryKey: queryKeys.mode06(vehicleId),
    queryFn: () => api.getMode06(vehicleId),
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Freeze-frame (Mode 02)</h2>
        {ffQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {ffQ.data?.length === 0 && (
          <p className="text-sm text-slate-400">No freeze-frame snapshots on file.</p>
        )}
        <ul className="space-y-2">
          {ffQ.data?.map((ff) => (
            <li key={ff.dtc} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="font-mono font-semibold text-slate-800">{ff.dtc}</span>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {ff.readings.map((r) => (
                  <li key={`${ff.dtc}-${r.pid}`}>
                    {r.pid}: {r.value}
                    {r.unit ? ` ${r.unit}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Mode 06 monitors</h2>
        {mode06Q.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {mode06Q.data?.length === 0 && (
          <p className="text-sm text-slate-400">No Mode 06 results on file.</p>
        )}
        <ul className="space-y-1.5">
          {mode06Q.data?.map((m) => (
            <li
              key={`${m.tid}:${m.mid}`}
              className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-mono text-slate-700">
                TID {m.tid} / MID {m.mid}
              </span>
              <span className="text-xs text-slate-500">
                {m.value}
                {m.passed === true ? " · pass" : m.passed === false ? " · fail" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
