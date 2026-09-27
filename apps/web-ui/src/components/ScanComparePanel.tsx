import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "../lib/api.ts";
import { type CodeChange, compareScans, type ReadingChange } from "../lib/scan-compare.ts";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
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

/** Shows what changed between the oldest saved scan and the newest. */
export function ScanComparePanel({ vehicleId }: { vehicleId: string }) {
  const batchesQ = useQuery({
    queryKey: queryKeys.observationBatches(vehicleId),
    queryFn: () => api.listObservationBatches(vehicleId),
  });

  if (batchesQ.isError) {
    return (
      <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        Scans could not be loaded.
      </p>
    );
  }

  const comparison = batchesQ.data ? compareScans(batchesQ.data) : null;
  if (!comparison) return null;

  const still = comparison.codes.filter((code) => code.kind === "still");
  const status = comparison.codes.filter((code) => code.kind === "status");
  const onlyEarlier = comparison.codes.filter((code) => code.kind === "only-earlier");
  const onlyLater = comparison.codes.filter((code) => code.kind === "only-later");
  const noCodes = comparison.codes.length === 0;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">What changed between scans</h2>
      <p className="mt-1 text-xs text-slate-500">
        The earlier scan is the oldest saved snapshot. The later scan is the newest. A drive session
        counts as one snapshot, its last sample.
      </p>
      <p className="mt-2 text-xs text-slate-600">
        Earlier: {formatWhen(comparison.earlier.capturedAt)} · Later:{" "}
        {formatWhen(comparison.later.capturedAt)}
      </p>
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
