import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";

function readFocusSessionFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const { hash } = window.location;
  if (!hash.startsWith("#session:")) return null;
  try {
    return decodeURIComponent(hash.slice("#session:".length));
  } catch {
    return null;
  }
}

/** Drive sessions + simulated upload + retention prune (software path). */
export function DriveSessionsPanel({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const [focusSessionId, setFocusSessionId] = useState<string | null>(readFocusSessionFromHash);

  useEffect(() => {
    const onHash = () => setFocusSessionId(readFocusSessionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const sessionsQ = useQuery({
    queryKey: queryKeys.driveSessions(vehicleId),
    queryFn: () => api.listDriveSessions(vehicleId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.driveSessions(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.evidenceProvenance(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.liveGauges(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.dtcs(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.forecast(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.recognition(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.observationBatches(vehicleId) });
  };

  const simulate = useMutation({
    mutationFn: () => api.simulateDriveSession(vehicleId),
    onSuccess: invalidate,
  });
  const prune = useMutation({
    mutationFn: () => api.pruneObservations(vehicleId),
    onSuccess: invalidate,
  });

  return (
    <section
      id="drive-sessions"
      className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Drive sessions</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Groups observation batches. Simulate uploads without live MX+; prune downsamples old
            PID-only history (keeps DTCs / freeze-frame / Mode 06).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={simulate.isPending}
            onClick={() => simulate.mutate()}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Simulate drive
          </button>
          <button
            type="button"
            disabled={prune.isPending}
            onClick={() => prune.mutate()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Prune PID history
          </button>
        </div>
      </div>

      {simulate.isSuccess && (
        <p className="mb-2 text-xs text-green-700">
          Simulated {simulate.data.batches.length} batches in session {simulate.data.session.id}.
        </p>
      )}
      {prune.isSuccess && (
        <p className="mb-2 text-xs text-slate-600">
          Retention: {prune.data.beforeCount} → {prune.data.afterCount} batches (removed{" "}
          {prune.data.removedCount}).
        </p>
      )}

      {sessionsQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {sessionsQ.data?.length === 0 && (
        <p className="text-sm text-slate-400">No drive sessions yet.</p>
      )}
      <ul className="space-y-2">
        {sessionsQ.data?.map((s) => {
          const focused = focusSessionId === s.id;
          return (
            <li
              key={s.id}
              id={`session-${s.id}`}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                focused ? "border border-sky-300 bg-sky-50 ring-1 ring-sky-200" : "bg-slate-50"
              }`}
            >
              <div>
                <span className="font-medium text-slate-800">{s.label ?? s.id}</span>
                <p className="text-xs text-slate-500">
                  {s.source} · started {new Date(s.startedAt).toLocaleString()}
                  {s.endedAt ? ` · ended ${new Date(s.endedAt).toLocaleString()}` : " · open"}
                  {s.batchCount != null ? ` · ${s.batchCount} batches` : ""}
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                  s.endedAt
                    ? "border-slate-200 bg-white text-slate-600"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {s.endedAt ? "closed" : "open"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
