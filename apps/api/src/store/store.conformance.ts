/**
 * Shared Store adapter conformance suite.
 *
 * Every Store adapter must pass this identical suite. It runs against the
 * in-memory adapter always, and against Drizzle/Postgres when DATABASE_URL
 * is set. One contract, two implementations, one spec.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  DriveSession,
  ObdCapabilityReport,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import { DISCOVERY_HISTORY_LIMIT } from "./index.ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Store } from "./index.ts";

const vehicle: VehicleProfile = {
  id: "veh:test-jeep",
  make: "Jeep",
  model: "Renegade",
  year: 2015,
  trim: "Latitude",
  engineFamily: "fca-tigershark-2.4",
  notes: "conformance fixture",
};

function batch(overrides: Partial<ObservationBatch> = {}): ObservationBatch {
  return {
    vehicleId: vehicle.id,
    capturedAt: "2026-07-19T12:00:00.000Z",
    source: "simulated",
    dtcs: [{ code: "P0304", status: "stored" }],
    pids: [{ pid: "ENGINE_LOAD", value: 80, unit: "%", timestamp: "2026-07-19T12:00:00.000Z" }],
    ...overrides,
  };
}

export function runStoreConformance(label: string, makeStore: () => Store): void {
  describe(`Store conformance: ${label}`, () => {
    let store: Store;

    beforeEach(async () => {
      store = makeStore();
      await store.init();
      await store.reset();
    });

    afterAll(async () => {
      if (store) await store.close();
    });

    it(`reports driver=${label === "memory" ? "memory" : "postgres"}`, () => {
      expect(store.driver).toBe(label === "memory" ? "memory" : "postgres");
    });

    it("stores and reads back a vehicle, preserving optional fields", async () => {
      await store.vehicles.create(vehicle);
      const read = await store.vehicles.get(vehicle.id);
      expect(read).toEqual(vehicle);
      expect(await store.vehicles.list()).toHaveLength(1);
    });

    it("updates a vehicle via patch merge", async () => {
      await store.vehicles.create(vehicle);
      const updated = await store.vehicles.update(vehicle.id, {
        odometerMiles: 92000,
        notes: "updated",
      });
      expect(updated.odometerMiles).toBe(92000);
      expect(updated.notes).toBe("updated");
      expect(updated.make).toBe("Jeep");
    });

    it("records observation batches and derives latest DTCs / PIDs / series", async () => {
      await store.vehicles.create(vehicle);
      await store.observations.record(
        batch({
          capturedAt: "2026-07-19T10:00:00.000Z",
          dtcs: [{ code: "P0304", status: "pending" }],
          pids: [
            { pid: "ENGINE_LOAD", value: 40, unit: "%", timestamp: "2026-07-19T10:00:00.000Z" },
          ],
        }),
      );
      await store.observations.record(
        batch({
          capturedAt: "2026-07-19T12:00:00.000Z",
          dtcs: [{ code: "P0304", status: "stored" }],
          pids: [
            { pid: "ENGINE_LOAD", value: 85, unit: "%", timestamp: "2026-07-19T12:00:00.000Z" },
          ],
          freezeFrames: [
            {
              dtc: "P0304",
              readings: [
                { pid: "ENGINE_LOAD", value: 85, unit: "%", timestamp: "2026-07-19T12:00:00.000Z" },
              ],
            },
          ],
          mode06: [{ tid: "0B", mid: "A1", value: 10, min: 0, max: 100, passed: true }],
        }),
      );

      expect(await store.observations.batchCount(vehicle.id)).toBe(2);
      expect(await store.observations.listBatches(vehicle.id)).toHaveLength(2);
      const dtcs = await store.observations.latestDtcs(vehicle.id);
      expect(dtcs).toEqual([{ code: "P0304", status: "stored" }]);
      expect(await store.observations.latestPids(vehicle.id)).toEqual({ ENGINE_LOAD: 85 });
      expect(await store.observations.latestFreezeFrames(vehicle.id)).toHaveLength(1);
      expect(await store.observations.latestMode06(vehicle.id)).toHaveLength(1);
      const series = await store.observations.series(vehicle.id, "ENGINE_LOAD");
      expect(series.map((p) => p.value)).toEqual([40, 85]);

      const provenance = await store.observations.provenance(vehicle.id);
      expect(provenance.batchCount).toBe(2);
      expect(provenance.latestSource).toBe("simulated");
      expect(provenance.sourcesSeen).toContain("simulated");

      const pidReadings = await store.observations.latestPidReadings(vehicle.id);
      expect(pidReadings.find((p) => p.pid === "ENGINE_LOAD")?.value).toBe(85);
    });

    it("replaceAll rewrites observation batches for a vehicle", async () => {
      await store.vehicles.create(vehicle);
      await store.observations.record(batch({ capturedAt: "2026-07-19T10:00:00.000Z" }));
      await store.observations.record(batch({ capturedAt: "2026-07-19T11:00:00.000Z" }));
      await store.observations.replaceAll(vehicle.id, [
        batch({ capturedAt: "2026-07-19T12:00:00.000Z", sessionId: "session:kept" }),
      ]);
      const batches = await store.observations.listBatches(vehicle.id);
      expect(batches).toHaveLength(1);
      expect(batches[0]?.sessionId).toBe("session:kept");
    });

    it("stores drive sessions and lists them by vehicle", async () => {
      await store.vehicles.create(vehicle);
      const session: DriveSession = {
        id: "session:test-1",
        vehicleId: vehicle.id,
        startedAt: "2026-07-19T10:00:00.000Z",
        source: "simulated",
        label: "conformance",
      };
      await store.sessions.create(session);
      const ended = await store.sessions.update(session.id, {
        endedAt: "2026-07-19T11:00:00.000Z",
        batchCount: 3,
      });
      expect(ended.endedAt).toBe("2026-07-19T11:00:00.000Z");
      expect(ended.batchCount).toBe(3);
      expect(await store.sessions.get(session.id)).toEqual(ended);
      expect(await store.sessions.listByVehicle(vehicle.id)).toHaveLength(1);
    });

    it("stores problems and updates status / payload fields", async () => {
      await store.vehicles.create(vehicle);
      const problem: DiagnosticProblem = {
        id: "problem:misfire-1",
        vehicleId: vehicle.id,
        status: "open",
        statement: {
          currentState: "cylinder 4 misfire under load",
          desiredState: "no misfire DTCs; smooth idle and load",
          gap: "ignition or injector fault",
        },
        actions: [],
        createdAt: "2026-07-19T12:00:00.000Z",
        updatedAt: "2026-07-19T12:00:00.000Z",
      };
      await store.problems.create(problem);
      expect((await store.problems.get(problem.id))?.status).toBe("open");
      const updated = await store.problems.update(problem.id, { status: "analyzing" });
      expect(updated.status).toBe("analyzing");
      expect(await store.problems.listByVehicle(vehicle.id)).toHaveLength(1);
    });

    it("stores recommendations and decisions scoped by vehicle", async () => {
      await store.vehicles.create(vehicle);
      const rec: Recommendation = {
        id: "rec:coil-swap",
        vehicleId: vehicle.id,
        title: "Swap coil on cylinder 4",
        priority: "high",
        status: "new",
        reason: "P0304 + high load",
        generatedFromClasses: ["MisfireUnderLoad"],
        createdAt: "2026-07-19T12:00:00.000Z",
      };
      await store.recommendations.create(rec);
      await store.recommendations.update(rec.id, { status: "accepted" });
      expect((await store.recommendations.listByVehicle(vehicle.id))[0]?.status).toBe("accepted");

      const decision: DecisionRecord = {
        id: "decision:1",
        vehicleId: vehicle.id,
        problemId: "problem:misfire-1",
        actionId: "swap-coil-4",
        rationale: "highest ranked act",
        policyAllowed: true,
        decidedAt: "2026-07-19T13:00:00.000Z",
        decidedBy: "user:owner",
      };
      await store.decisions.create(decision);
      expect(await store.decisions.listByVehicle(vehicle.id)).toHaveLength(1);
    });

    it("records discovery reports with latest + capped history", async () => {
      await store.vehicles.create(vehicle);
      const base: ObdCapabilityReport = {
        vehicleId: vehicle.id,
        capturedAt: "2026-07-20T10:00:00.000Z",
        source: "simulated",
        connection: {
          connected: false,
          port: null,
          protocolId: null,
          protocolName: null,
        },
        modes: {
          mode01: { supported: [], unsupported: [], unknown: ["RPM"] },
          mode02FreezeFrame: { supported: null },
          mode03Dtcs: { supported: null },
          mode07Pending: { supported: null },
          mode06: { supportedMids: [], unsupportedMids: [], unknownMids: ["21"] },
          vin: { supported: null },
        },
        manualOnlyPids: [],
      };
      for (let i = 0; i < DISCOVERY_HISTORY_LIMIT + 2; i++) {
        await store.discovery.record({
          ...base,
          capturedAt: `2026-07-20T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
        });
      }
      const list = await store.discovery.list(vehicle.id);
      expect(list.length).toBe(DISCOVERY_HISTORY_LIMIT);
      expect(list[0]?.capturedAt).toBe(
        `2026-07-20T${String(10 + DISCOVERY_HISTORY_LIMIT + 1).padStart(2, "0")}:00:00.000Z`,
      );
      expect((await store.discovery.latest(vehicle.id))?.capturedAt).toBe(list[0]?.capturedAt);
    });

    it("reset() clears all tables / maps", async () => {
      await store.vehicles.create(vehicle);
      await store.observations.record(batch());
      await store.sessions.create({
        id: "session:reset",
        vehicleId: vehicle.id,
        startedAt: "2026-07-19T10:00:00.000Z",
        source: "simulated",
      });
      await store.discovery.record({
        vehicleId: vehicle.id,
        capturedAt: "2026-07-20T12:00:00.000Z",
        source: "simulated",
        connection: {
          connected: false,
          port: null,
          protocolId: null,
          protocolName: null,
        },
        modes: {
          mode01: { supported: [], unsupported: [], unknown: [] },
          mode02FreezeFrame: { supported: null },
          mode03Dtcs: { supported: null },
          mode07Pending: { supported: null },
          mode06: { supportedMids: [], unsupportedMids: [], unknownMids: [] },
          vin: { supported: null },
        },
        manualOnlyPids: [],
      });
      await store.reset();
      expect(await store.vehicles.list()).toHaveLength(0);
      expect(await store.observations.batchCount(vehicle.id)).toBe(0);
      expect(await store.sessions.listByVehicle(vehicle.id)).toHaveLength(0);
      expect(await store.discovery.list(vehicle.id)).toHaveLength(0);
    });
  });
}
