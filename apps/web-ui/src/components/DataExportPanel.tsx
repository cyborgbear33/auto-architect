import type { GarageDump, GarageImportResult } from "@auto/semantic-types";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";
import { downloadCsv, downloadJson, safeFilename } from "../lib/download.ts";

type BusyKey =
  | "garage-json"
  | "vehicle-json"
  | "observations"
  | "dtcs"
  | "decisions"
  | "problems"
  | "timeline"
  | "import"
  | null;

/**
 * Garage JSON dump/restore + per-vehicle CSV tables. Does not invent classes —
 * export is compose-only; import merges into the store.
 */
export function DataExportPanel({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(key: BusyKey, fn: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  function invalidateAfterImport() {
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles() });
    void qc.invalidateQueries({ queryKey: queryKeys.vehicle(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.dtcs(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.decisions(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.problems(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.caseTimeline(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.evidenceProvenance(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.recognition(vehicleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.forecast(vehicleId) });
  }

  async function onImportFile(file: File) {
    await run("import", async () => {
      const text = await file.text();
      const dump = JSON.parse(text) as GarageDump;
      const result: GarageImportResult = await api.importGarage(dump);
      invalidateAfterImport();
      setMessage(
        `Imported: ${result.vehiclesUpserted} vehicles, ${result.observationsAppended} batches` +
          (result.observationsSkipped ? ` (${result.observationsSkipped} skipped)` : "") +
          `, ${result.problemsUpserted} problems, ${result.decisionsUpserted} decisions.`,
      );
    });
  }

  const slug = safeFilename(vehicleId);
  const btn =
    "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Export &amp; import</h2>
      <p className="mb-3 text-xs text-slate-400">
        JSON dump is the portable garage backup. CSV tables are for spreadsheets and analysis —
        same spirit as garden-architect&apos;s CSV downloads.
      </p>

      <div className="mb-3">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          JSON
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={busy !== null}
            onClick={() =>
              run("vehicle-json", async () => {
                const dump = await api.exportVehicle(vehicleId);
                downloadJson(`garage-${slug}.json`, dump);
                setMessage("Vehicle JSON download started.");
              })
            }
          >
            This vehicle (.json)
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy !== null}
            onClick={() =>
              run("garage-json", async () => {
                const dump = await api.exportGarage();
                downloadJson("garage-full.json", dump);
                setMessage("Full garage JSON download started.");
              })
            }
          >
            Full garage (.json)
          </button>
          <button
            type="button"
            className={btn}
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onImportFile(file);
            }}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          CSV (this vehicle)
        </h3>
        <div className="flex flex-wrap gap-2">
          <CsvButton
            label="Observations"
            busy={busy === "observations"}
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              run("observations", async () => {
                downloadCsv(
                  `observations-${slug}.csv`,
                  await api.exportObservationsCsv(vehicleId),
                );
                setMessage("Observations CSV download started.");
              })
            }
          />
          <CsvButton
            label="DTCs"
            busy={busy === "dtcs"}
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              run("dtcs", async () => {
                downloadCsv(`dtcs-${slug}.csv`, await api.exportDtcsCsv(vehicleId));
                setMessage("DTCs CSV download started.");
              })
            }
          />
          <CsvButton
            label="Decisions"
            busy={busy === "decisions"}
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              run("decisions", async () => {
                downloadCsv(`decisions-${slug}.csv`, await api.exportDecisionsCsv(vehicleId));
                setMessage("Decisions CSV download started.");
              })
            }
          />
          <CsvButton
            label="Problems"
            busy={busy === "problems"}
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              run("problems", async () => {
                downloadCsv(`problems-${slug}.csv`, await api.exportProblemsCsv(vehicleId));
                setMessage("Problems CSV download started.");
              })
            }
          />
          <CsvButton
            label="Timeline"
            busy={busy === "timeline"}
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              run("timeline", async () => {
                downloadCsv(`timeline-${slug}.csv`, await api.exportTimelineCsv(vehicleId));
                setMessage("Timeline CSV download started.");
              })
            }
          />
        </div>
      </div>

      {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}
    </section>
  );
}

function CsvButton({
  label,
  onClick,
  disabled,
  busy,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  className: string;
}) {
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {busy ? `${label}…` : `${label} (.csv)`}
    </button>
  );
}
