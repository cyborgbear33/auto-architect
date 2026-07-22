import { lookupDtc, lookupPid } from "@auto/ontology";
import {
  DEFAULT_LIVE_GAUGE_PIDS,
  type DtcObservation,
  type EvidenceProvenance,
  type ImReadiness,
  type ImStatusObservation,
  type LiveGaugeStrip,
  type ObservationBatch,
  type RetentionResult,
} from "@auto/semantic-types";
import type { ObservationBatchInput } from "@auto/validation";
import { notFound, validationError } from "../lib/errors.ts";
import type { Store } from "../store/index.ts";
import {
  detectObdLogFormat,
  type ObdLogImportFormat,
  type ObdLogImportResult,
  parseElm327Text,
  parseObdLogV1,
} from "./obd-log-import.ts";
import type { VehicleService } from "./vehicle.ts";

/** Re-export for discovery + existing import sites. */
export { DEFAULT_LIVE_GAUGE_PIDS };

/** Age above this → strip marked stale (live watch should refresh faster). */
export const LIVE_GAUGE_STALE_AFTER_MS = 15_000;

/** PID-only batches newer than this are kept in full. */
export const RETAIN_PID_FULL_MS = 30 * 24 * 60 * 60 * 1000;

/** Ingests validated Observation batches from obd-gateway (or manual entry). Never realizes/solves itself. */
export class ObservationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async record(input: ObservationBatchInput): Promise<void> {
    await this.vehicles.getOrThrow(input.vehicleId); // 404s early on an unknown vehicle
    if (input.sessionId) {
      const session = await this.store.sessions.get(input.sessionId);
      if (!session) throw notFound("DriveSession", input.sessionId);
      if (session.vehicleId !== input.vehicleId) {
        throw validationError(`Session "${input.sessionId}" belongs to a different vehicle.`);
      }
    }
    await this.store.observations.record(input);
    if (input.odometerMiles !== undefined) {
      await this.vehicles.update(input.vehicleId, { odometerMiles: input.odometerMiles });
    }
  }

  /**
   * Offline ingest: `obdlog-v1`, ELM327 AT/session text, or JSON ObservationBatch
   * array. Format `auto` (default) sniffs content. Does not talk to hardware.
   */
  async importLog(
    vehicleId: string,
    input: { format?: ObdLogImportFormat; text: string },
  ): Promise<ObdLogImportResult> {
    await this.vehicles.getOrThrow(vehicleId);
    const text = input.text ?? "";
    if (!text.trim()) throw validationError("Import text is empty.");
    const format =
      !input.format || input.format === "auto" ? detectObdLogFormat(text) : input.format;

    if (format === "json-batches") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw validationError("json-batches import requires valid JSON.");
      }
      if (!Array.isArray(parsed)) {
        throw validationError("json-batches import expects an array of observation batches.");
      }
      let recorded = 0;
      for (const row of parsed) {
        const batch = row as ObservationBatchInput;
        await this.record({ ...batch, vehicleId: batch.vehicleId || vehicleId });
        recorded += 1;
      }
      return { format, batchesRecorded: recorded, linesParsed: recorded, linesSkipped: 0 };
    }

    const parsed =
      format === "elm327-text"
        ? parseElm327Text(text, { vehicleId })
        : parseObdLogV1(text, { vehicleId });
    for (const batch of parsed.batches) {
      await this.record({ ...batch, vehicleId });
    }
    return {
      format,
      batchesRecorded: parsed.batches.length,
      linesParsed: parsed.linesParsed,
      linesSkipped: parsed.linesSkipped,
    };
  }

  async listBatches(vehicleId: string): Promise<ObservationBatch[]> {
    await this.vehicles.getOrThrow(vehicleId);
    return this.store.observations.listBatches(vehicleId);
  }

  async latestDtcs(vehicleId: string): Promise<DtcObservation[]> {
    await this.vehicles.getOrThrow(vehicleId);
    const dtcs = await this.store.observations.latestDtcs(vehicleId);
    return dtcs.map(enrichDtcDescription);
  }

  async latestFreezeFrames(vehicleId: string) {
    return this.store.observations.latestFreezeFrames(vehicleId);
  }

  async latestMode06(vehicleId: string) {
    return this.store.observations.latestMode06(vehicleId);
  }

  async provenance(vehicleId: string): Promise<EvidenceProvenance> {
    await this.vehicles.getOrThrow(vehicleId);
    return this.store.observations.provenance(vehicleId);
  }

  /**
   * Keep FF/Mode06/DTC evidence forever; downsample older PID-only batches
   * to at most one sample per hour outside the recent window.
   */
  async applyRetention(vehicleId: string, nowMs: number = Date.now()): Promise<RetentionResult> {
    await this.vehicles.getOrThrow(vehicleId);
    const before = await this.store.observations.listBatches(vehicleId);
    const kept = selectBatchesForRetention(before, nowMs);
    await this.store.observations.replaceAll(vehicleId, kept);
    const evidence = kept.filter(isEvidenceBatch).length;
    return {
      vehicleId,
      beforeCount: before.length,
      afterCount: kept.length,
      removedCount: before.length - kept.length,
      keptEvidenceBatches: evidence,
      keptPidBatches: kept.length - evidence,
    };
  }

  /**
   * Live Operate gauges: latest readings for the console PID set, dictionary
   * units/labels, and strip-level freshness from the latest observation batch.
   */
  async liveGauges(
    vehicleId: string,
    pidKeys: readonly string[] = DEFAULT_LIVE_GAUGE_PIDS,
  ): Promise<LiveGaugeStrip> {
    await this.vehicles.getOrThrow(vehicleId);
    const provenance = await this.store.observations.provenance(vehicleId);
    const readings = await this.store.observations.latestPidReadings(vehicleId);
    const byPid = new Map(readings.map((r) => [r.pid, r]));

    const now = Date.now();
    const ageMs =
      provenance.latestCapturedAt !== null
        ? Math.max(0, now - Date.parse(provenance.latestCapturedAt))
        : null;
    const stale = ageMs === null ? true : ageMs > LIVE_GAUGE_STALE_AFTER_MS;

    const gauges = pidKeys.map((pid) => {
      const entry = lookupPid(pid);
      const reading = byPid.get(pid);
      return {
        pid,
        label: shortPidLabel(pid, entry?.description),
        value: reading?.value ?? null,
        unit: entry?.unit ?? null,
        timestamp: reading?.timestamp ?? null,
      };
    });

    return {
      vehicleId,
      source: provenance.latestSource,
      capturedAt: provenance.latestCapturedAt,
      ageMs,
      stale,
      staleAfterMs: LIVE_GAUGE_STALE_AFTER_MS,
      gauges,
    };
  }

  /**
   * I/M readiness / monitor completion (J1979 Mode 01 PID $01 STATUS).
   * Uses the latest batch that carries structured `imStatus` — never invents
   * complete/incomplete from empty DTCs alone.
   */
  async readiness(vehicleId: string): Promise<ImReadiness> {
    await this.vehicles.getOrThrow(vehicleId);
    const batches = await this.store.observations.listBatches(vehicleId);
    const withStatus = [...batches]
      .reverse()
      .find((b) => b.imStatus !== undefined && b.imStatus !== null);

    if (!withStatus?.imStatus) {
      const hasBatches = batches.length > 0;
      return {
        vehicleId,
        available: false,
        status: hasBatches ? "no_data" : "unsupported",
        requiredPid: "STATUS",
        message: hasBatches
          ? "Observations on file, but none include Mode 01 PID $01 STATUS yet. Run a gateway scan (or simulate) — empty DTCs are still not a smog-ready claim."
          : "I/M monitor readiness needs Mode 01 PID $01 (STATUS bitfield). No STATUS capture on file yet — empty DTCs are not a smog-ready claim.",
        source: null,
        capturedAt: null,
      };
    }

    return imReadinessFromStatus(vehicleId, withStatus.imStatus, {
      source: withStatus.source,
      capturedAt: withStatus.capturedAt,
    });
  }
}

/** Pure mapping — exported for unit tests. */
export function imReadinessFromStatus(
  vehicleId: string,
  im: ImStatusObservation,
  meta: { source: ObservationBatch["source"]; capturedAt: string },
): ImReadiness {
  const status = im.allComplete ? "complete" : "incomplete";
  const incomplete = im.monitors.filter((m) => m.available && !m.complete);
  const message = im.allComplete
    ? "All available I/M monitors report complete (Mode 01 PID $01). Still not a legal smog certificate — confirm with your jurisdiction."
    : incomplete.length > 0
      ? `${incomplete.length} available monitor(s) incomplete (e.g. ${incomplete[0]!.name}). Not ready to claim monitor completion.`
      : "STATUS captured but no available monitors were reported.";

  return {
    vehicleId,
    available: true,
    status,
    requiredPid: "STATUS",
    message,
    source: meta.source,
    capturedAt: meta.capturedAt,
    mil: im.mil,
    dtcCount: im.dtcCount,
    ignitionType: im.ignitionType,
    monitors: im.monitors,
  };
}

function shortPidLabel(pid: string, description?: string): string {
  if (!description) return pid;
  // Prefer a short operator label; fall back to the dictionary sentence.
  const shortcuts: Record<string, string> = {
    RPM: "RPM",
    ENGINE_LOAD: "Load",
    SHORT_FUEL_TRIM_1: "STFT B1",
    LONG_FUEL_TRIM_1: "LTFT B1",
    COOLANT_TEMP: "Coolant",
    SPEED: "Speed",
  };
  return shortcuts[pid] ?? description;
}

/** Prefer adapter text; fill from curated SAE dictionary when silent. */
export function enrichDtcDescription(dtc: DtcObservation): DtcObservation {
  const existing = dtc.description?.trim();
  if (existing) return dtc;
  const fromDict = lookupDtc(dtc.code)?.description;
  if (!fromDict) return dtc;
  return { ...dtc, description: fromDict };
}

function isEvidenceBatch(b: ObservationBatch): boolean {
  return (
    (b.dtcs?.length ?? 0) > 0 ||
    (b.freezeFrames?.length ?? 0) > 0 ||
    (b.mode06?.length ?? 0) > 0 ||
    b.imStatus !== undefined
  );
}

function hourBucket(iso: string): string {
  return iso.slice(0, 13); // YYYY-MM-DDTHH
}

/** Pure retention selection — exported for unit tests. */
export function selectBatchesForRetention(
  batches: ObservationBatch[],
  nowMs: number,
  retainPidFullMs: number = RETAIN_PID_FULL_MS,
): ObservationBatch[] {
  const cutoff = nowMs - retainPidFullMs;
  const kept: ObservationBatch[] = [];
  const hourlyPid = new Map<string, ObservationBatch>();

  const sorted = [...batches].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  for (const batch of sorted) {
    if (isEvidenceBatch(batch)) {
      kept.push(batch);
      continue;
    }
    const t = Date.parse(batch.capturedAt);
    if (Number.isNaN(t) || t >= cutoff) {
      kept.push(batch);
      continue;
    }
    // Older PID-only: keep latest batch per hour.
    hourlyPid.set(hourBucket(batch.capturedAt), batch);
  }
  kept.push(...hourlyPid.values());
  return kept.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}
