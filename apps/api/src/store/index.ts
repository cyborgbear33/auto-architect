import type {
  DecisionRecord,
  DiagnosticProblem,
  DtcObservation,
  EvidenceProvenance,
  FreezeFrame,
  Mode06Result,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import type { ApiConfig } from "../config.ts";
import { createDrizzleStore } from "./drizzle.ts";
import { createMemoryStore } from "./memory.ts";

export { createDrizzleStore, createMemoryStore };

/**
 * The storage seam. Services and routes depend only on this interface —
 * `createMemoryStore` / `createDrizzleStore` are interchangeable adapters.
 */
export interface Store {
  readonly driver: "memory" | "postgres";
  vehicles: VehicleRepository;
  observations: ObservationRepository;
  problems: ProblemRepository;
  recommendations: RecommendationRepository;
  decisions: DecisionRepository;
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
  latestDtcs(vehicleId: string): Promise<DtcObservation[]>;
  latestPids(vehicleId: string): Promise<Record<string, number>>;
  latestFreezeFrames(vehicleId: string): Promise<FreezeFrame[]>;
  latestMode06(vehicleId: string): Promise<Mode06Result[]>;
  /** Every value ever recorded for one PID on one vehicle, in capture order (for `forecast`). */
  series(vehicleId: string, pid: string): Promise<Array<{ timestamp: string; value: number }>>;
  batchCount(vehicleId: string): Promise<number>;
  /** Latest batch source/time + distinct sources seen for this vehicle. */
  provenance(vehicleId: string): Promise<EvidenceProvenance>;
}

export interface ProblemRepository {
  create(problem: DiagnosticProblem): Promise<DiagnosticProblem>;
  get(id: string): Promise<DiagnosticProblem | undefined>;
  update(id: string, patch: Partial<DiagnosticProblem>): Promise<DiagnosticProblem>;
  listByVehicle(vehicleId: string): Promise<DiagnosticProblem[]>;
}

export interface RecommendationRepository {
  create(rec: Recommendation): Promise<Recommendation>;
  listByVehicle(vehicleId: string): Promise<Recommendation[]>;
  update(id: string, patch: Partial<Recommendation>): Promise<Recommendation>;
}

export interface DecisionRepository {
  create(rec: DecisionRecord): Promise<DecisionRecord>;
  listByVehicle(vehicleId: string): Promise<DecisionRecord[]>;
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
