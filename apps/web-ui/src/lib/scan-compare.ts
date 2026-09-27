import type { DtcStatus, ObservationBatch } from "@auto/semantic-types";

export type CodeChangeKind = "still" | "status" | "only-earlier" | "only-later";

export interface CodeChange {
  code: string;
  kind: CodeChangeKind;
  earlierStatus?: DtcStatus;
  laterStatus?: DtcStatus;
}

export interface ReadingChange {
  pid: string;
  unit?: string;
  kind: "changed" | "only-earlier" | "only-later";
  earlier?: number;
  later?: number;
}

export interface ScanComparison {
  earlier: ObservationBatch;
  later: ObservationBatch;
  codes: CodeChange[];
  readings: ReadingChange[];
}

/**
 * One snapshot per drive session (its last sample), plus each batch that is
 * not in a session. A long watch is not a stack of separate scans.
 */
export function scanSnapshots(batches: readonly ObservationBatch[]): ObservationBatch[] {
  const bySession = new Map<string, ObservationBatch>();
  const loose: ObservationBatch[] = [];
  for (const batch of batches) {
    const sessionId = batch.sessionId;
    if (sessionId) {
      const prev = bySession.get(sessionId);
      if (!prev || prev.capturedAt.localeCompare(batch.capturedAt) <= 0) {
        bySession.set(sessionId, batch);
      }
    } else {
      loose.push(batch);
    }
  }
  return [...bySession.values(), ...loose].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

function dtcMap(batch: ObservationBatch): Map<string, DtcStatus> {
  const out = new Map<string, DtcStatus>();
  for (const dtc of batch.dtcs ?? []) out.set(dtc.code.toUpperCase(), dtc.status);
  return out;
}

function pidMap(batch: ObservationBatch): Map<string, { value: number; unit?: string }> {
  const out = new Map<string, { value: number; unit?: string }>();
  for (const reading of batch.pids ?? []) {
    out.set(reading.pid, { value: reading.value, ...(reading.unit ? { unit: reading.unit } : {}) });
  }
  return out;
}

/**
 * Keep the earlier index strictly before the later one. Defaults are the
 * first and last snapshots. Null until two snapshots exist.
 */
export function clampScanPair(
  count: number,
  earlier: number,
  later: number,
): { earlier: number; later: number } | null {
  if (count < 2) return null;
  const e = Math.max(0, Math.min(Math.trunc(earlier), count - 2));
  let l = Math.max(0, Math.min(Math.trunc(later), count - 1));
  if (l <= e) l = e + 1;
  return { earlier: e, later: l };
}

/** One stored snapshot against another. Same snapshot is not a comparison. */
export function compareSnapshotPair(
  earlier: ObservationBatch,
  later: ObservationBatch,
): ScanComparison | null {
  if (earlier === later) return null;

  const before = dtcMap(earlier);
  const after = dtcMap(later);
  const codes: CodeChange[] = [];
  for (const code of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const earlierStatus = before.get(code);
    const laterStatus = after.get(code);
    if (earlierStatus && laterStatus && earlierStatus === laterStatus) {
      codes.push({ code, kind: "still", earlierStatus, laterStatus });
    } else if (earlierStatus && laterStatus) {
      codes.push({ code, kind: "status", earlierStatus, laterStatus });
    } else if (earlierStatus) {
      codes.push({ code, kind: "only-earlier", earlierStatus });
    } else if (laterStatus) {
      codes.push({ code, kind: "only-later", laterStatus });
    }
  }

  const beforePids = pidMap(earlier);
  const afterPids = pidMap(later);
  const readings: ReadingChange[] = [];
  for (const pid of [...new Set([...beforePids.keys(), ...afterPids.keys()])].sort()) {
    const left = beforePids.get(pid);
    const right = afterPids.get(pid);
    const unit = right?.unit ?? left?.unit;
    if (left && right && left.value !== right.value) {
      readings.push({
        pid,
        kind: "changed",
        earlier: left.value,
        later: right.value,
        ...(unit ? { unit } : {}),
      });
    } else if (left && !right) {
      readings.push({ pid, kind: "only-earlier", earlier: left.value, ...(unit ? { unit } : {}) });
    } else if (right && !left) {
      readings.push({ pid, kind: "only-later", later: right.value, ...(unit ? { unit } : {}) });
    }
  }

  return { earlier, later, codes, readings };
}

/** Earliest snapshot against the latest. Null until two snapshots exist. */
export function compareScans(batches: readonly ObservationBatch[]): ScanComparison | null {
  const points = scanSnapshots(batches);
  const pair = clampScanPair(points.length, 0, points.length - 1);
  if (!pair) return null;
  const earlier = points[pair.earlier];
  const later = points[pair.later];
  if (!earlier || !later) return null;
  return compareSnapshotPair(earlier, later);
}
