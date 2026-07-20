import type {
  DecisionRecord,
  DiagnosticProblem,
  DriveSession,
  DtcObservation,
  EvidenceProvenance,
  FreezeFrame,
  Mode06Result,
  ObdCapabilityReport,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import type { ApiConfig } from "../config.ts";
import { createDrizzleStore } from "./drizzle.ts";
import { createMemoryStore } from "./memory.ts";

export { createDrizzleStore, createMemoryStore };

/** Keep a short history of capability discoveries per vehicle. */
export const DISCOVERY_HISTORY_LIMIT = 5;

/**
 * The storage seam. Services and routes depend only on this interface —
 * `createMemoryStore` / `createDrizzleStore` are interchangeable adapters.
 */
export interface Store {
  readonly driver: "memory" | "postgres";
  vehicles: VehicleRepository;
  observations: ObservationRepository;
  sessions: SessionRepository;
  problems: ProblemRepository;
  recommendations: RecommendationRepository;
  decisions: DecisionRepository;
  discovery: DiscoveryRepository;
  init(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface VehicleRepository {
  list(): Promise<VehicleProfile[]>;
  get(id: string): Promise<VehicleProfile | undefined>;
  create(profile: VehicleProfile): Promise<VehicleProfile>;
  update(id: string, patch: Partial<VehicleProfile>): Promise<VehicleProfile>;
}

export interface ObservationRepository {
  record(batch: ObservationBatch): Promise<void>;
  /** All batches for a vehicle, oldest → newest (export / import). */
  listBatches(vehicleId: string): Promise<ObservationBatch[]>;
  latestDtcs(vehicleId: string): Promise<DtcObservation[]>;
  latestPids(vehicleId: string): Promise<Record<string, number>>;
  latestFreezeFrames(vehicleId: string): Promise<FreezeFrame[]>;
  latestMode06(vehicleId: string): Promise<Mode06Result[]>;
  /** Every value ever recorded for one PID on one vehicle, in capture order (for `forecast`). */
  series(
    vehicleId: string,
    pid: string,
    opts?: { sessionId?: string },
  ): Promise<Array<{ timestamp: string; value: number }>>;
  batchCount(vehicleId: string): Promise<number>;
  /** Latest batch source/time + distinct sources seen for this vehicle. */
  provenance(vehicleId: string): Promise<EvidenceProvenance>;
  /** Latest value+timestamp per PID (most recent batch that contained it). */
  latestPidReadings(
    vehicleId: string,
  ): Promise<Array<{ pid: string; value: number; timestamp: string }>>;
  /** Replace the full batch list for a vehicle (retention prune). */
  replaceAll(vehicleId: string, batches: ObservationBatch[]): Promise<void>;
}

export interface SessionRepository {
  create(session: DriveSession): Promise<DriveSession>;
  get(id: string): Promise<DriveSession | undefined>;
  update(id: string, patch: Partial<DriveSession>): Promise<DriveSession>;
  listByVehicle(vehicleId: string): Promise<DriveSession[]>;
}

export interface ProblemRepository {
  create(problem: DiagnosticProblem): Promise<DiagnosticProblem>;
  get(id: string): Promise<DiagnosticProblem | undefined>;
  update(id: string, patch: Partial<DiagnosticProblem>): Promise<DiagnosticProblem>;
  listByVehicle(vehicleId: string): Promise<DiagnosticProblem[]>;
}

export interface RecommendationRepository {
  create(rec: Recommendation): Promise<Recommendation>;
  get(id: string): Promise<Recommendation | undefined>;
  listByVehicle(vehicleId: string): Promise<Recommendation[]>;
  update(id: string, patch: Partial<Recommendation>): Promise<Recommendation>;
}

export interface DecisionRepository {
  create(rec: DecisionRecord): Promise<DecisionRecord>;
  listByVehicle(vehicleId: string): Promise<DecisionRecord[]>;
}

export interface DiscoveryRepository {
  record(report: ObdCapabilityReport): Promise<void>;
  latest(vehicleId: string): Promise<ObdCapabilityReport | undefined>;
  /** Newest first, capped at DISCOVERY_HISTORY_LIMIT. */
  list(vehicleId: string): Promise<ObdCapabilityReport[]>;
}

/** Build the configured store. Services never learn which adapter this is. */
export function createStore(config: Pick<ApiConfig, "storageDriver" | "databaseUrl">): Store {
  if (config.storageDriver === "postgres") {
    if (!config.databaseUrl) {
      throw new Error("STORAGE_DRIVER=postgres requires DATABASE_URL to be set.");
    }
    return createDrizzleStore(config.databaseUrl);
  }
  return createMemoryStore();
}
