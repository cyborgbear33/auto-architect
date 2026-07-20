/**
 * Drive sessions group observation batches from a watch/sim drive.
 * Simulated uploads exercise the path without live MX+ hardware.
 */
import type { DriveSession, ObservationBatch, RetentionResult } from "@auto/semantic-types";
import type {
  EndDriveSessionInput,
  SimulateDriveSessionInput,
  StartDriveSessionInput,
} from "@auto/validation";
import { conflict, notFound } from "../lib/errors.ts";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { ObservationService } from "./observations.ts";
import type { VehicleService } from "./vehicle.ts";

export class DriveSessionService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private observations: ObservationService,
  ) {}

  async list(vehicleId: string): Promise<DriveSession[]> {
    await this.vehicles.getOrThrow(vehicleId);
    return this.store.sessions.listByVehicle(vehicleId);
  }

  async get(sessionId: string): Promise<DriveSession> {
    const session = await this.store.sessions.get(sessionId);
    if (!session) throw notFound("DriveSession", sessionId);
    return session;
  }

  async start(input: StartDriveSessionInput): Promise<DriveSession> {
    await this.vehicles.getOrThrow(input.vehicleId);
    const open = (await this.store.sessions.listByVehicle(input.vehicleId)).find((s) => !s.endedAt);
    if (open) {
      throw conflict(
        `Vehicle already has an open drive session (${open.id}). End it before starting another.`,
      );
    }
    const now = nowIso();
    const session: DriveSession = {
      id: newId("session"),
      vehicleId: input.vehicleId,
      startedAt: now,
      source: input.source ?? "obd_gateway",
      label: input.label,
      odometerStartMiles: input.odometerStartMiles,
    };
    return this.store.sessions.create(session);
  }

  async end(input: EndDriveSessionInput): Promise<DriveSession> {
    const session = await this.get(input.sessionId);
    if (session.endedAt) return session;
    const batches = (await this.store.observations.listBatches(session.vehicleId)).filter(
      (b) => b.sessionId === session.id,
    );
    return this.store.sessions.update(session.id, {
      endedAt: nowIso(),
      odometerEndMiles: input.odometerEndMiles,
      batchCount: batches.length,
    });
  }

  /**
   * Software-only path: open a session, append a short simulated PID/DTC
   * stream, close the session. Useful without live MX+.
   */
  async simulate(input: SimulateDriveSessionInput): Promise<{
    session: DriveSession;
    batches: ObservationBatch[];
  }> {
    const vehicle = await this.vehicles.getOrThrow(input.vehicleId);
    const session = await this.start({
      vehicleId: input.vehicleId,
      label: input.label ?? "Simulated drive",
      source: "simulated",
      odometerStartMiles: vehicle.odometerMiles,
    });

    const base = Date.parse(session.startedAt);
    const points: Array<{ offsetSec: number; rpm: number; load: number; stft: number }> = [
      { offsetSec: 0, rpm: 750, load: 18, stft: 0.5 },
      { offsetSec: 30, rpm: 1800, load: 45, stft: 2.0 },
      { offsetSec: 60, rpm: 2400, load: 72, stft: 3.5 },
      { offsetSec: 90, rpm: 2100, load: 55, stft: 1.5 },
      { offsetSec: 120, rpm: 900, load: 22, stft: 0.8 },
    ];

    const batches: ObservationBatch[] = [];
    for (const [i, p] of points.entries()) {
      const capturedAt = new Date(base + p.offsetSec * 1000).toISOString();
      const batch: ObservationBatch = {
        vehicleId: input.vehicleId,
        capturedAt,
        source: "simulated",
        sessionId: session.id,
        odometerMiles:
          vehicle.odometerMiles !== undefined
            ? vehicle.odometerMiles + Math.round(i * 0.4)
            : undefined,
        pids: [
          { pid: "RPM", value: p.rpm, unit: "rpm", timestamp: capturedAt },
          { pid: "ENGINE_LOAD", value: p.load, unit: "%", timestamp: capturedAt },
          { pid: "SHORT_FUEL_TRIM_1", value: p.stft, unit: "%", timestamp: capturedAt },
          { pid: "COOLANT_TEMP", value: 88 + i, unit: "°C", timestamp: capturedAt },
        ],
        ...(i === 2 ? { dtcs: [{ code: "P0304", status: "pending" as const }] } : {}),
      };
      await this.observations.record(batch);
      batches.push(batch);
    }

    const ended = await this.end({
      sessionId: session.id,
      odometerEndMiles: vehicle.odometerMiles !== undefined ? vehicle.odometerMiles + 2 : undefined,
    });
    return { session: ended, batches };
  }

  async applyRetention(vehicleId: string): Promise<RetentionResult> {
    return this.observations.applyRetention(vehicleId);
  }
}
