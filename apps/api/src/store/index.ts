import type {
  DecisionRecord,
  DiagnosticProblem,
  DtcObservation,
  FreezeFrame,
  Mode06Result,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";

/**
 * The storage seam. Today only `createMemoryStore` exists (Phase B, per the
 * plan: "in-memory store first, Postgres later") — everything above this
 * interface (services, routes) is written against the interface, not the
 * implementation, so swapping in a Postgres-backed store later is additive.
 */
export interface Store {
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

export { createMemoryStore } from "./memory.ts";
