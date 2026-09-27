import type { ObservationBatch, ObservationSource } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";
import {
  type CodeChange,
  clampScanPair,
  compareSnapshotPair,
  type ReadingChange,
  scanSnapshots,
} from "../lib/scan-compare.ts";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function sourceLabel(source: ObservationSource): string {
  if (source === "obd_gateway") return "live adapter";
  if (source === "simulated") return "simulated";
  if (source === "manual_entry") return "manual entry";
  return "imported file";
}

function snapshotLabel(batch: ObservationBatch): string {
  return `${formatWhen(batch.capturedAt)} · ${sourceLabel(batch.source)}`;
}

function readingText(change: ReadingChange): string {
  const unit = change.unit ? ` ${change.unit}` : "";
  if (change.kind === "changed") {
    return `${change.pid}: ${change.earlier}${unit} → ${change.later}${unit}`;
  }
  if (change.kind === "only-earlier")
    return `${change.pid}: ${change.earlier}${unit} on the earlier scan only`;
  return `${change.pid}: ${change.later}${unit} on the later scan only`;
}

function CodeList({ title, codes }: { title: string; codes: CodeChange[] }) {
  if (codes.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
      <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
        {codes.map((code) => (
          <li key={code.code}>
            {code.code}
            {code.kind === "status"
              ? ` (${code.earlierStatus} → ${code.laterStatus})`
              : code.kind === "still"
                ? ` (${code.laterStatus})`
                : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shows what changed between two saved scans. Defaults to oldest against newest. */
export function ScanComparePanel({ vehicleId }: { vehicleId: string }) {
  const batchesQ = useQuery({
    queryKey: queryKeys.observationBatches(vehicleId),
    queryFn: () => api.listObservationBatches(vehicleId),
  });
  const snapshots = useMemo(
    () => (batchesQ.data ? scanSnapshots(batchesQ.data) : []),
    [batchesQ.data],
  );
  const [earlierIndex, setEarlierIndex] = useState(0);
  const [laterIndex, setLaterIndex] = useState<number | null>(null);

  if (batchesQ.isError) {
    return (
      <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        Scans could not be loaded.
      </p>
    );
  }

  const pair = clampScanPair(snapshots.length, earlierIndex, laterIndex ?? snapshots.length - 1);
  const earlier = pair ? snapshots[pair.earlier] : undefined;
  const later = pair ? snapshots[pair.later] : undefined;
  const comparison = earlier && later ? compareSnapshotPair(earlier, later) : null;
  if (!comparison || !pair) return null;
  const canChoose = snapshots.length > 2;

  const still = comparison.codes.filter((code) => code.kind === "still");
  const status = comparison.codes.filter((code) => code.kind === "status");
  const onlyEarlier = comparison.codes.filter((code) => code.kind === "only-earlier");
  const onlyLater = comparison.codes.filter((code) => code.kind === "only-later");
  const noCodes = comparison.codes.length === 0;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">What changed between scans</h2>
      <p className="mt-1 text-xs text-slate-500">
        {canChoose
          ? "Pick the scan from before the work and the scan from after. A drive session counts as one snapshot, its last sample."
          : "The earlier scan is the oldest saved snapshot. The later scan is the newest. A drive session counts as one snapshot, its last sample."}
      </p>
      {canChoose ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-600">
            Earlier scan
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
              value={pair.earlier}
              onChange={(event) => setEarlierIndex(Number(event.target.value))}
            >
              {snapshots.slice(0, -1).map((snapshot, index) => (
                <option
                  key={`${snapshot.capturedAt}-${snapshot.sessionId ?? "loose"}`}
                  value={index}
                >
                  {snapshotLabel(snapshot)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-600">
            Later scan
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
              value={pair.later}
              onChange={(event) => setLaterIndex(Number(event.target.value))}
            >
              {snapshots.slice(pair.earlier + 1).map((snapshot, offset) => {
                const index = pair.earlier + 1 + offset;
                return (
                  <option
                    key={`${snapshot.capturedAt}-${snapshot.sessionId ?? "loose"}`}
                    value={index}
                  >
                    {snapshotLabel(snapshot)}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-600">
          Earlier: {formatWhen(comparison.earlier.capturedAt)} · Later:{" "}
          {formatWhen(comparison.later.capturedAt)}
        </p>
      )}
      <div className="mt-3 space-y-3">
        <CodeList title="Still on both scans" codes={still} />
        <CodeList title="Status changed" codes={status} />
        <CodeList title="Not on the later scan" codes={onlyEarlier} />
        <CodeList title="Only on the later scan" codes={onlyLater} />
        {comparison.readings.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-700">Readings that differ</h3>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
              {comparison.readings.map((change) => (
                <li key={change.pid}>{readingText(change)}</li>
              ))}
            </ul>
          </div>
        )}
        {noCodes && comparison.readings.length === 0 && (
          <p className="text-sm text-slate-600">The readings on the two scans match.</p>
        )}
        {noCodes && (
          <p className="text-sm text-slate-600">
            Neither scan stored a trouble code. That is not a verdict that the vehicle is healthy.
          </p>
        )}
        {onlyEarlier.length > 0 && (
          <p className="text-sm text-slate-600">
            A code missing from the later scan is not proof it is gone. Run a verify check before
            calling the case solved.
          </p>
        )}
      </div>
    </section>
  );
}
