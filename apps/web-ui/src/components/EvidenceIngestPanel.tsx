import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";

/**
 * Dashboard ingest ritual (UX6) — get Mode 01–07 evidence on file without
 * burying import on Journal. Live MX+ stays Guide/CLI; simulate + OBD log are
 * honest software paths (source labels stay visible elsewhere).
 */
export function EvidenceIngestPanel({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  function invalidateEvidence() {
    void qc.invalidateQueries({ queryKey: queryKeys.driveSessions(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.evidenceProvenance(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.liveGaugesRoot(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.readiness(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.dtcs(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.forecast(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.recognition(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.recommendations(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.observationBatches(vehicleId) });
  }

  const simulate = useMutation({
    mutationFn: () => api.simulateDriveSession(vehicleId),
    onSuccess: () => {
      invalidateEvidence();
      setMessage("Simulated drive session uploaded (source: simulated).");
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : "Simulate failed.");
    },
  });

  const importLog = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const format = file.name.toLowerCase().endsWith(".json") ? "json-batches" : ("auto" as const);
      return api.importObservationLog(vehicleId, { format, text });
    },
    onSuccess: (result) => {
      invalidateEvidence();
      setMessage(
        `OBD log imported (${result.format}): ${result.batchesRecorded} batch(es)` +
          (result.linesSkipped ? `, ${result.linesSkipped} lines skipped` : "") +
          ".",
      );
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    },
  });

  const busy = simulate.isPending || importLog.isPending;
  const btn =
    "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <section
      id="evidence-ingest"
      className="mb-4 scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-slate-700">Get evidence on file</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Live MX+ scan is via gateway/CLI (see Guide). Without hardware: import an OBD log or
        simulate a short drive — never mistaken for a clean bill of health.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => {
            setMessage(null);
            simulate.mutate();
          }}
        >
          {simulate.isPending ? "Simulating…" : "Simulate drive session"}
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => {
            setMessage(null);
            fileRef.current?.click();
          }}
        >
          {importLog.isPending ? "Importing…" : "Import OBD log"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".obdlog,.txt,.log,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) importLog.mutate(file);
          }}
        />
        <Link to="/guide" className="text-xs font-medium text-sky-700 hover:underline">
          Live scan Guide →
        </Link>
        <Link to="/journal" className="text-xs font-medium text-sky-700 hover:underline">
          Full export/import →
        </Link>
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </section>
  );
}
