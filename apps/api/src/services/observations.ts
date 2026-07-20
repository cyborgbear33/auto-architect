import { lookupPid } from "@auto/ontology";
import type { EvidenceProvenance, LiveGaugeStrip } from "@auto/semantic-types";
import type { ObservationBatchInput } from "@auto/validation";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";

/** Default Operate strip — matches gateway DEFAULT_PIDS “console” subset. */
export const DEFAULT_LIVE_GAUGE_PIDS = [
  "RPM",
  "ENGINE_LOAD",
  "SHORT_FUEL_TRIM_1",
  "COOLANT_TEMP",
] as const;

/** Age above this → strip marked stale (live watch should refresh faster). */
export const LIVE_GAUGE_STALE_AFTER_MS = 15_000;

/** Ingests validated Observation batches from obd-gateway (or manual entry). Never realizes/solves itself. */
export class ObservationService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async record(input: ObservationBatchInput): Promise<void> {
    await this.vehicles.getOrThrow(input.vehicleId); // 404s early on an unknown vehicle
    await this.store.observations.record(input);
    if (input.odometerMiles !== undefined) {
      await this.vehicles.update(input.vehicleId, { odometerMiles: input.odometerMiles });
    }
  }

  async latestDtcs(vehicleId: string) {
    return this.store.observations.latestDtcs(vehicleId);
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
