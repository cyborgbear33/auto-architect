import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { buildSessionSummary } from "./drive-sessions.ts";
import { createServices } from "./index.ts";
import { selectBatchesForRetention } from "./observations.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("DriveSessionService + retention", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("simulates a drive session with linked batches", async () => {
    const { session, batches } = await services.driveSessions.simulate({ vehicleId: JEEP });
    expect(session.endedAt).toBeTruthy();
    expect(session.source).toBe("simulated");
    expect(batches.length).toBeGreaterThanOrEqual(4);
    expect(batches.every((b) => b.sessionId === session.id)).toBe(true);
    expect(session.batchCount).toBe(batches.length);

    const listed = await services.driveSessions.list(JEEP);
    expect(listed.some((s) => s.id === session.id)).toBe(true);
    expect(await store.observations.batchCount(JEEP)).toBe(batches.length);
  });

  it("keeps evidence batches and downsamples old PID-only hours", () => {
    const now = Date.parse("2026-07-01T00:00:00Z");
    const batches = [
      {
        vehicleId: JEEP,
        capturedAt: "2026-01-01T10:00:00Z",
        source: "simulated" as const,
        pids: [{ pid: "RPM", value: 1, timestamp: "2026-01-01T10:00:00Z" }],
      },
      {
        vehicleId: JEEP,
        capturedAt: "2026-01-01T10:30:00Z",
        source: "simulated" as const,
        pids: [{ pid: "RPM", value: 2, timestamp: "2026-01-01T10:30:00Z" }],
      },
      {
        vehicleId: JEEP,
        capturedAt: "2026-01-01T11:00:00Z",
        source: "simulated" as const,
        dtcs: [{ code: "P0304", status: "stored" as const }],
        pids: [{ pid: "RPM", value: 3, timestamp: "2026-01-01T11:00:00Z" }],
      },
      {
        vehicleId: JEEP,
        capturedAt: "2026-06-20T12:00:00Z",
        source: "simulated" as const,
        pids: [{ pid: "RPM", value: 4, timestamp: "2026-06-20T12:00:00Z" }],
      },
    ];
    const kept = selectBatchesForRetention(batches, now);
    // Evidence batch always kept; old hour keeps latest (10:30); recent PID kept.
    expect(kept.some((b) => b.dtcs?.length)).toBe(true);
    expect(kept.filter((b) => b.capturedAt.startsWith("2026-01-01T10")).length).toBe(1);
    expect(kept.some((b) => b.pids?.[0]?.value === 2)).toBe(true);
    expect(kept.some((b) => b.pids?.[0]?.value === 4)).toBe(true);
  });

  it("buildSessionSummary rolls up DTCs and PID peaks", () => {
    const summary = buildSessionSummary(
      {
        id: "session:1",
        vehicleId: JEEP,
        startedAt: "2026-07-19T10:00:00.000Z",
        endedAt: "2026-07-19T10:02:00.000Z",
        source: "simulated",
        batchCount: 2,
      },
      [
        {
          vehicleId: JEEP,
          capturedAt: "2026-07-19T10:00:00.000Z",
          source: "simulated",
          sessionId: "session:1",
          pids: [
            { pid: "RPM", value: 800, timestamp: "2026-07-19T10:00:00.000Z" },
            { pid: "ENGINE_LOAD", value: 20, timestamp: "2026-07-19T10:00:00.000Z" },
          ],
        },
        {
          vehicleId: JEEP,
          capturedAt: "2026-07-19T10:01:00.000Z",
          source: "simulated",
          sessionId: "session:1",
          dtcs: [{ code: "P0304", status: "pending" }],
          pids: [
            { pid: "RPM", value: 2400, timestamp: "2026-07-19T10:01:00.000Z" },
            { pid: "ENGINE_LOAD", value: 70, timestamp: "2026-07-19T10:01:00.000Z" },
          ],
        },
      ],
    );
    expect(summary.durationSec).toBe(120);
    expect(summary.dtcCodes).toEqual(["P0304"]);
    expect(summary.maxRpm).toBe(2400);
    expect(summary.maxEngineLoad).toBe(70);
    expect(summary.open).toBe(false);
  });

  it("summarizeLast prefers the most recently ended session", async () => {
    const first = await services.driveSessions.simulate({
      vehicleId: JEEP,
      label: "Older",
    });
    const second = await services.driveSessions.simulate({
      vehicleId: JEEP,
      label: "Newer",
    });
    const summary = await services.driveSessions.summarizeLast(JEEP);
    expect(summary?.session.id).toBe(second.session.id);
    expect(summary?.session.id).not.toBe(first.session.id);
    expect(summary?.dtcCodes).toContain("P0304");
  });

  it("applyRetention rewrites store batches", async () => {
    const old = "2025-01-01T08:00:00Z";
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: old,
      source: "simulated",
      pids: [{ pid: "RPM", value: 1, timestamp: old }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2025-01-01T08:15:00Z",
      source: "simulated",
      pids: [{ pid: "RPM", value: 2, timestamp: "2025-01-01T08:15:00Z" }],
    });
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2025-01-01T09:00:00Z",
      source: "simulated",
      freezeFrames: [
        {
          dtc: "P0304",
          readings: [{ pid: "RPM", value: 9, timestamp: "2025-01-01T09:00:00Z" }],
        },
      ],
    });

    const result = await services.observations.applyRetention(
      JEEP,
      Date.parse("2026-07-01T00:00:00Z"),
    );
    expect(result.beforeCount).toBe(3);
    expect(result.afterCount).toBe(2);
    expect(result.keptEvidenceBatches).toBe(1);
    expect(await store.observations.batchCount(JEEP)).toBe(2);
  });
});
