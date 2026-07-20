/**
 * Drizzle/Postgres Store adapter — production path for durable garage state.
 *
 * Implements the same Store contract as createMemoryStore. `init()` applies
 * committed migrations; `reset()` truncates tables (tests only).
 */

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type {
  DtcObservation,
  FreezeFrame,
  Mode06Result,
  ObservationBatch,
  VehicleProfile,
} from "@auto/semantic-types";
import { asc, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type DbHandle } from "../db/client.ts";
import * as t from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";
import type {
  DecisionRepository,
  ObservationRepository,
  ProblemRepository,
  RecommendationRepository,
  Store,
  VehicleRepository,
} from "./index.ts";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

function vehicleRow(profile: VehicleProfile) {
  return {
    id: profile.id,
    make: profile.make,
    model: profile.model,
    year: profile.year,
    trim: profile.trim,
    engineFamily: profile.engineFamily,
    payload: profile,
  };
}

export function createDrizzleStore(databaseUrl: string): Store {
  const handle: DbHandle = createDb(databaseUrl);
  const { db, sql } = handle;

  const vehicles: VehicleRepository = {
    async list() {
      const rows = await db.select().from(t.vehicles);
      return rows.map((r) => r.payload);
    },
    async get(id) {
      const [row] = await db.select().from(t.vehicles).where(eq(t.vehicles.id, id)).limit(1);
      return row?.payload;
    },
    async create(profile) {
      await db.insert(t.vehicles).values(vehicleRow(profile));
      return profile;
    },
    async update(id, patch) {
      const existing = await vehicles.get(id);
      if (!existing) throw notFound("Vehicle", id);
      const updated = { ...existing, ...patch, id };
      await db.update(t.vehicles).set(vehicleRow(updated)).where(eq(t.vehicles.id, id));
      return updated;
    },
  };

  const observations: ObservationRepository = {
    async record(batch) {
      const id = `obs:${batch.vehicleId}:${batch.capturedAt}:${randomUUID()}`;
      await db.insert(t.observationBatches).values({
        id,
        vehicleId: batch.vehicleId,
        capturedAt: batch.capturedAt,
        source: batch.source,
        payload: batch,
      });
    },

    async latestDtcs(vehicleId) {
      const rows = await batchesFor(vehicleId);
      const byCode = new Map<string, DtcObservation>();
      for (const batch of rows) {
        for (const dtc of batch.dtcs ?? []) byCode.set(dtc.code, dtc);
      }
      return [...byCode.values()];
    },

    async latestPids(vehicleId) {
      const rows = await batchesFor(vehicleId);
      const latest: Record<string, number> = {};
      for (const batch of rows) {
        for (const p of batch.pids ?? []) latest[p.pid] = p.value;
      }
      return latest;
    },

    async latestFreezeFrames(vehicleId) {
      const rows = await batchesFor(vehicleId);
      const byDtc = new Map<string, FreezeFrame>();
      for (const batch of rows) {
        for (const f of batch.freezeFrames ?? []) byDtc.set(f.dtc, f);
      }
      return [...byDtc.values()];
    },

    async latestMode06(vehicleId) {
      const rows = await batchesFor(vehicleId);
      const byKey = new Map<string, Mode06Result>();
      for (const batch of rows) {
        for (const m of batch.mode06 ?? []) byKey.set(`${m.tid}:${m.mid}`, m);
      }
      return [...byKey.values()];
    },

    async series(vehicleId, pid) {
      const rows = await batchesFor(vehicleId);
      const out: Array<{ timestamp: string; value: number }> = [];
      for (const batch of rows) {
        for (const p of batch.pids ?? []) {
          if (p.pid === pid) out.push({ timestamp: p.timestamp, value: p.value });
        }
      }
      return out;
    },

    async batchCount(vehicleId) {
      const rows = await db
        .select({ id: t.observationBatches.id })
        .from(t.observationBatches)
        .where(eq(t.observationBatches.vehicleId, vehicleId));
      return rows.length;
    },
  };

  async function batchesFor(vehicleId: string): Promise<ObservationBatch[]> {
    const rows = await db
      .select()
      .from(t.observationBatches)
      .where(eq(t.observationBatches.vehicleId, vehicleId))
      .orderBy(asc(t.observationBatches.capturedAt));
    return rows.map((r) => r.payload);
  }

  const problems: ProblemRepository = {
    async create(problem) {
      await db.insert(t.problems).values({
        id: problem.id,
        vehicleId: problem.vehicleId,
        status: problem.status,
        payload: problem,
        createdAt: problem.createdAt,
        updatedAt: problem.updatedAt,
      });
      return problem;
    },
    async get(id) {
      const [row] = await db.select().from(t.problems).where(eq(t.problems.id, id)).limit(1);
      return row?.payload;
    },
    async update(id, patch) {
      const existing = await problems.get(id);
      if (!existing) throw notFound("DiagnosticProblem", id);
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      await db
        .update(t.problems)
        .set({
          status: updated.status,
          payload: updated,
          updatedAt: updated.updatedAt,
        })
        .where(eq(t.problems.id, id));
      return updated;
    },
    async listByVehicle(vehicleId) {
      const rows = await db.select().from(t.problems).where(eq(t.problems.vehicleId, vehicleId));
      return rows.map((r) => r.payload);
    },
  };

  const recommendations: RecommendationRepository = {
    async create(rec) {
      await db.insert(t.recommendations).values({
        id: rec.id,
        vehicleId: rec.vehicleId,
        status: rec.status,
        payload: rec,
        createdAt: rec.createdAt,
      });
      return rec;
    },
    async listByVehicle(vehicleId) {
      const rows = await db
        .select()
        .from(t.recommendations)
        .where(eq(t.recommendations.vehicleId, vehicleId));
      return rows.map((r) => r.payload);
    },
    async update(id, patch) {
      const [existingRow] = await db
        .select()
        .from(t.recommendations)
        .where(eq(t.recommendations.id, id))
        .limit(1);
      if (!existingRow) throw notFound("Recommendation", id);
      const updated = { ...existingRow.payload, ...patch, id };
      await db
        .update(t.recommendations)
        .set({ status: updated.status, payload: updated })
        .where(eq(t.recommendations.id, id));
      return updated;
    },
  };

  const decisions: DecisionRepository = {
    async create(rec) {
      await db.insert(t.decisions).values({
        id: rec.id,
        vehicleId: rec.vehicleId,
        problemId: rec.problemId,
        payload: rec,
        decidedAt: rec.decidedAt,
      });
      return rec;
    },
    async listByVehicle(vehicleId) {
      const rows = await db.select().from(t.decisions).where(eq(t.decisions.vehicleId, vehicleId));
      return rows.map((r) => r.payload);
    },
  };

  return {
    driver: "postgres" as const,
    vehicles,
    observations,
    problems,
    recommendations,
    decisions,
    async init() {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    async reset() {
      await sql.unsafe(
        `TRUNCATE vehicles, observation_batches, problems, recommendations, decisions;`,
      );
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
