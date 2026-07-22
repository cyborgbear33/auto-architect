import type {
  DecisionRecord,
  DiagnosticProblem,
  DriveSession,
  DtcObservation,
  FreezeFrame,
  KnowledgeGapProposal,
  Mode06Result,
  ObdCapabilityReport,
  ObservationBatch,
  ObservationSource,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import { notFound } from "../lib/errors.ts";
import type {
  DecisionRepository,
  DiscoveryRepository,
  GapProposalRepository,
  ObservationRepository,
  ProblemRepository,
  RecommendationRepository,
  SessionRepository,
  Store,
  VehicleRepository,
} from "./index.ts";
import { DISCOVERY_HISTORY_LIMIT } from "./index.ts";

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
      const updated: VehicleProfile = { ...existing, ...patch };
      // Explicit undefined clears optional identity fields (V1 VIN/odo ritual).
      for (const key of Object.keys(patch) as (keyof VehicleProfile)[]) {
        if (patch[key] === undefined) delete updated[key];
      }
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

    async listBatches(vehicleId) {
      return [...batchesFor(vehicleId)];
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

    async series(vehicleId, pid, opts) {
      const out: Array<{ timestamp: string; value: number }> = [];
      for (const batch of batchesFor(vehicleId)) {
        if (opts?.sessionId && batch.sessionId !== opts.sessionId) continue;
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

    async replaceAll(vehicleId, next) {
      const sorted = [...next].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      batches.set(vehicleId, sorted);
    },
  };
}

function createSessionRepository(): SessionRepository {
  const byId = new Map<string, DriveSession>();
  return {
    async create(session) {
      byId.set(session.id, session);
      return session;
    },
    async get(id) {
      return byId.get(id);
    },
    async update(id, patch) {
      const existing = byId.get(id);
      if (!existing) throw notFound("DriveSession", id);
      const updated = { ...existing, ...patch, id };
      byId.set(id, updated);
      return updated;
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()]
        .filter((s) => s.vehicleId === vehicleId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
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
      const updated = applyProblemPatch(existing, patch);
      byId.set(id, updated);
      return updated;
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()].filter((p) => p.vehicleId === vehicleId);
    },
  };
}

/** Merge patch; `undefined` values remove keys (e.g. clear verification on reopen). */
function applyProblemPatch(
  existing: DiagnosticProblem,
  patch: Partial<DiagnosticProblem>,
): DiagnosticProblem {
  const updated: DiagnosticProblem = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (updated as unknown as Record<string, unknown>)[key];
    }
  }
  return updated;
}

function createRecommendationRepository(): RecommendationRepository {
  const byId = new Map<string, Recommendation>();
  return {
    async create(rec) {
      byId.set(rec.id, rec);
      return rec;
    },
    async get(id) {
      return byId.get(id);
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

function createDiscoveryRepository(): DiscoveryRepository {
  const byVehicle = new Map<string, ObdCapabilityReport[]>();
  return {
    async record(report) {
      const list = byVehicle.get(report.vehicleId) ?? [];
      list.push(report);
      list.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
      byVehicle.set(report.vehicleId, list.slice(0, DISCOVERY_HISTORY_LIMIT));
    },
    async latest(vehicleId) {
      return byVehicle.get(vehicleId)?.[0];
    },
    async list(vehicleId) {
      return [...(byVehicle.get(vehicleId) ?? [])];
    },
  };
}

export function createMemoryStore(): Store {
  let vehicles = createVehicleRepository();
  let observations = createObservationRepository();
  let sessions = createSessionRepository();
  let problems = createProblemRepository();
  let recommendations = createRecommendationRepository();
  let decisions = createDecisionRepository();
  let discovery = createDiscoveryRepository();
  let gapProposals = createGapProposalRepository();

  return {
    driver: "memory" as const,
    get vehicles() {
      return vehicles;
    },
    get observations() {
      return observations;
    },
    get sessions() {
      return sessions;
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
    get discovery() {
      return discovery;
    },
    get gapProposals() {
      return gapProposals;
    },
    async init() {
      /* nothing to do for the in-memory driver */
    },
    async reset() {
      vehicles = createVehicleRepository();
      observations = createObservationRepository();
      sessions = createSessionRepository();
      problems = createProblemRepository();
      recommendations = createRecommendationRepository();
      decisions = createDecisionRepository();
      discovery = createDiscoveryRepository();
      gapProposals = createGapProposalRepository();
    },
    async close() {
      /* nothing to do for the in-memory driver */
    },
  };
}

function createGapProposalRepository(): GapProposalRepository {
  const byId = new Map<string, KnowledgeGapProposal>();
  return {
    async create(proposal) {
      byId.set(proposal.id, proposal);
      return proposal;
    },
    async get(id) {
      return byId.get(id);
    },
    async listByVehicle(vehicleId) {
      return [...byId.values()].filter((p) => p.vehicleId === vehicleId);
    },
    async update(id, patch) {
      const existing = byId.get(id);
      if (!existing) throw notFound("KnowledgeGapProposal", id);
      const updated = { ...existing, ...patch, id: existing.id };
      byId.set(id, updated);
      return updated;
    },
    async getByDedupeKey(vehicleId, dedupeKey) {
      return [...byId.values()].find((p) => p.vehicleId === vehicleId && p.dedupeKey === dedupeKey);
    },
  };
}
