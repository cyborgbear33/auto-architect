import type { EvidenceProvenance, ObservationSource } from "@auto/semantic-types";

const LABELS: Record<ObservationSource, string> = {
  obd_gateway: "Live OBD",
  simulated: "Simulated",
  manual_entry: "Manual entry",
  imported_file: "Imported file",
};

const TONES: Record<ObservationSource, string> = {
  obd_gateway: "border-emerald-200 bg-emerald-50 text-emerald-800",
  simulated: "border-amber-200 bg-amber-50 text-amber-900",
  manual_entry: "border-slate-200 bg-slate-100 text-slate-700",
  imported_file: "border-sky-200 bg-sky-50 text-sky-800",
};

function formatCapturedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Trust chrome: always say whether the operator is looking at live bus data,
 * a simulation, or a manual entry — never leave source implied.
 */
export function EvidenceSourceBadge({
  provenance,
  compact = false,
}: {
  provenance: EvidenceProvenance | undefined;
  compact?: boolean;
}) {
  if (!provenance || provenance.batchCount === 0 || !provenance.latestSource) {
    return (
      <p className="text-xs text-slate-400">
        No observation batches yet — nothing to label as live or simulated.
      </p>
    );
  }

  const latest = provenance.latestSource;
  const others = provenance.sourcesSeen.filter((s) => s !== latest);

  return (
    <div className={compact ? "inline-flex flex-wrap items-center gap-2" : "space-y-1"}>
      <span
        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[latest]}`}
        title={`Latest batch source: ${latest}`}
      >
        Latest evidence: {LABELS[latest]}
      </span>
      {!compact && provenance.latestCapturedAt && (
        <p className="text-xs text-slate-400">
          Captured {formatCapturedAt(provenance.latestCapturedAt)} · {provenance.batchCount}{" "}
          batch(es)
        </p>
      )}
      {others.length > 0 && (
        <p className="text-xs text-slate-400">
          Also on file: {others.map((s) => LABELS[s]).join(", ")}
        </p>
      )}
    </div>
  );
}
