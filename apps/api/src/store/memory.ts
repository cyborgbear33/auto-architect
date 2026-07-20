import type {
  DecisionRecord,
  DiagnosticProblem,
  DtcObservation,
  FreezeFrame,
  Mode06Result,
  ObservationBatch,
  ObservationSource,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import { notFound } from "../lib/errors.ts";
import type {
  DecisionRepository,
  ObservationRepository,
  ProblemRepository,
  RecommendationRepository,
  Store,
  VehicleRepository,
} from "./index.ts";

function createVehicleRepository(): VehicleRepository {
  const byId = new Map<string, VehicleProfile>();
  return {
    async list() {
      return [...byId.values()];
    },
    async get(id) {
      return byId.get(id);
    },
    async create(profile) {
      byId.set(profile.id, profile);
      return profile;
    },
    async update(id, patch) {
      const existing = byId.get(id);
      if (!existing) throw notFound("Vehicle", id);
      const updated = { ...existing, ...patch };
      byId.set(id, updated);
      return updated;
    },
  };
}

function createObservationRepository(): ObservationRepository {
  /** Append-only per-vehicle batch log — small enough in practice (one garage, one lifetime) to scan linearly. */
  const batches = new Map<string, ObservationBatch[]>();

  function batchesFor(vehicleId: string): ObservationBatch[] {
    return batches.get(vehicleId) ?? [];
  }

  return {
    async record(batch) {
      const list = batches.get(batch.vehicleId) ?? [];
      list.push(batch);
      list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      batches.set(batch.vehicleId, list);
    },

    async latestDtcs(vehicleId) {
      const byCode = new Map<string, DtcObservation>();
      for (const batch of batchesFor(vehicleId)) {
        for (const dtc of batch.dtcs ?? []) byCode.set(dtc.code, dtc);
      }
      return [...byCode.values()];
    },

    async latestPids(vehicleId) {
      const latest: Record<string, number> = {};
      for (const batch of batchesFor(vehicleId)) {
        for (const p of batch.pids ?? []) latest[p.pid] = p.value;
      }
      return latest;
    },

    async latestFreezeFrames(vehicleId) {
      const byDtc = new Map<string, FreezeFrame>();
      for (const batch of batchesFor(vehicleId)) {
        for (const f of batch.freezeFrames ?? []) byDtc.set(f.dtc, f);
      }
      return [...byDtc.values()];
    },

    async latestMode06(vehicleId) {
      const byKey = new Map<string, Mode06Result>();
      for (const batch of batchesFor(vehicleId)) {
        for (const m of batch.mode06 ?? []) byKey.set(`${m.tid}:${m.mid}`, m);
      }
      return [...byKey.values()];
    },

    async series(vehicleId, pid) {
      const out: Array<{ timestamp: string; value: number }> = [];
      for (const batch of batchesFor(vehicleId)) {
        for (const p of batch.pids ?? []) {
          if (p.pid === pid) out.push({ timestamp: p.timestamp, value: p.value });
        }
      }
      return out;
    },

    async batchCount(vehicleId) {
      return batchesFor(vehicleId).length;
    },

    async provenance(vehicleId) {
      const list = batchesFor(vehicleId);
      if (list.length === 0) {
        return { latestSource: null, latestCapturedAt: null, batchCount: 0, sourcesSeen: [] };
      }
      const latest = list[list.length - 1]!;
      const seen = new Set<ObservationSource>();
      for (const b of list) seen.add(b.source);
      return {
        latestSource: latest.source,
        latestCapturedAt: latest.capturedAt,
        batchCount: list.length,
        sourcesSeen: [...seen],
      };
    },

    async latestPidReadings(vehicleId) {
      const byPid = new Map<string, { pid: string; value: number; timestamp: string }>();
      // batchesFor is ascending; walk newest→oldest so first write wins as latest.
      for (const batch of [...batchesFor(vehicleId)].reverse()) {
        for (const p of batch.pids ?? []) {
          if (!byPid.has(p.pid)) {
            byPid.set(p.pid, { pid: p.pid, value: p.value, timestamp: p.timestamp });
          }
        }
      }
      return [...byPid.values()];
    },
  };
}

function createProblemRepository(): ProblemRepository {
  const byId = new Map<string, DiagnosticProblem>();
  return {
    async create(problem) {
      byId.set(problem.id, problem);
      return problem;
    },
    async get(id) {
      return byId.get(id);
    },
    async update(id, patch) {
      const existing = byId.get(id);
      if (!existing) throw notFound("DiagnosticProblem", id);
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      byId.set(id, updated);
      return updated;
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()].filter((p) => p.vehicleId === vehicleId);
    },
  };
}

function createRecommendationRepository(): RecommendationRepository {
  const byId = new Map<string, Recommendation>();
  return {
    async create(rec) {
      byId.set(rec.id, rec);
      return rec;
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()].filter((r) => r.vehicleId === vehicleId);
    },
    async update(id, patch) {
      const existing = byId.get(id);
      if (!existing) throw notFound("Recommendation", id);
      const updated = { ...existing, ...patch };
      byId.set(id, updated);
      return updated;
    },
  };
}

function createDecisionRepository(): DecisionRepository {
  const byId = new Map<string, DecisionRecord>();
  return {
    async create(rec) {
      byId.set(rec.id, rec);
      return rec;
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()].filter((d) => d.vehicleId === vehicleId);
    },
  };
}

export function createMemoryStore(): Store {
  let vehicles = createVehicleRepository();
  let observations = createObservationRepository();
  let problems = createProblemRepository();
  let recommendations = createRecommendationRepository();
  let decisions = createDecisionRepository();

  return {
    driver: "memory" as const,
    get vehicles() {
      return vehicles;
    },
    get observations() {
      return observations;
    },
    get problems() {
      return problems;
    },
    get recommendations() {
      return recommendations;
    },
    get decisions() {
      return decisions;
    },
    async init() {
      /* nothing to do for the in-memory driver */
    },
    async reset() {
      vehicles = createVehicleRepository();
      observations = createObservationRepository();
      problems = createProblemRepository();
      recommendations = createRecommendationRepository();
      decisions = createDecisionRepository();
    },
    async close() {
      /* nothing to do for the in-memory driver */
    },
  };
}
