import { lookupMode06 } from "@auto/ontology";
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import { useAppSelector } from "../store/index.ts";
import { EmptyEvidenceState } from "./EmptyEvidenceState.tsx";

/** Mode 02 freeze-frame + Mode 06 monitor results already exposed by the API. */
export function EvidencePanels({ vehicleId }: { vehicleId: string }) {
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const ffQ = useQuery({
    queryKey: queryKeys.freezeFrames(vehicleId),
    queryFn: () => api.getFreezeFrames(vehicleId),
  });
  const mode06Q = useQuery({
    queryKey: queryKeys.mode06(vehicleId),
    queryFn: () => api.getMode06(vehicleId),
  });

  return (
    <div id="evidence" className="grid scroll-mt-4 grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Freeze-frame (Mode 02)</h2>
        {ffQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {ffQ.data?.length === 0 && <EmptyEvidenceState kind="freeze_frame" />}
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
        <p className="mb-2 text-xs text-slate-400">
          Plain names from the SAE/ISO OBDMID seed only — unknown monitors stay unlabeled.
        </p>
        {mode06Q.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {mode06Q.data?.length === 0 && <EmptyEvidenceState kind="mode06" />}
        <ul className="space-y-1.5">
          {mode06Q.data?.map((m) => {
            const entry = lookupMode06(m.mid);
            return (
              <li
                key={`${m.tid}:${m.mid}`}
                className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">
                    {entry?.description ?? `Monitor ${m.mid}`}
                  </span>
                  {debugMode && (
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      MID {m.mid} / TID {m.tid} · value {m.value}
                      {m.min != null || m.max != null
                        ? ` (min ${m.min ?? "—"}, max ${m.max ?? "—"})`
                        : ""}
                    </p>
                  )}
                </div>
                <span
                  className={`flex-shrink-0 text-xs font-medium ${
                    m.passed === false
                      ? "text-amber-700"
                      : m.passed === true
                        ? "text-slate-500"
                        : "text-slate-400"
                  }`}
                >
                  {m.passed === true ? "pass" : m.passed === false ? "fail" : "n/a"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
