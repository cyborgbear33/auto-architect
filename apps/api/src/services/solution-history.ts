/**
 * Read-model: aggregate DecisionRecord + ProblemOutcome into "what worked"
 * buckets for a vehicle and its engine family. Does not mutate store state.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  OutcomeStatus,
  SolutionHistory,
  SolutionRollupBucket,
} from "@auto/semantic-types";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";

interface AccKey {
  actionId: string;
  faultClass: string | null;
}

function keyOf(k: AccKey): string {
  return `${k.actionId}\0${k.faultClass ?? ""}`;
}

function emptyBucket(
  actionId: string,
  faultClass: string | null,
  scope: "vehicle" | "engineFamily",
  engineFamily: string,
): SolutionRollupBucket {
  return {
    actionId,
    faultClass,
    scope,
    engineFamily,
    worked: 0,
    partial: 0,
    failed: 0,
    inconclusive: 0,
    totalWithOutcome: 0,
    lastDecidedAt: null,
  };
}

function bump(bucket: SolutionRollupBucket, status: OutcomeStatus, decidedAt: string): void {
  bucket[status] += 1;
  bucket.totalWithOutcome += 1;
  if (!bucket.lastDecidedAt || decidedAt > bucket.lastDecidedAt) {
    bucket.lastDecidedAt = decidedAt;
  }
}

function rank(a: SolutionRollupBucket, b: SolutionRollupBucket): number {
  if (b.worked !== a.worked) return b.worked - a.worked;
  if (b.totalWithOutcome !== a.totalWithOutcome) return b.totalWithOutcome - a.totalWithOutcome;
  return a.actionId.localeCompare(b.actionId);
}

export class SolutionHistoryService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async forVehicle(vehicleId: string, faultClassFilter?: string | null): Promise<SolutionHistory> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const filter = faultClassFilter?.trim() || null;

    const garage = await this.store.vehicles.list();
    const familyVehicleIds = garage
      .filter((v) => v.engineFamily === vehicle.engineFamily)
      .map((v) => v.id);

    const problemCache = new Map<string, DiagnosticProblem | undefined>();
    const resolveClass = async (problemId: string): Promise<string | null> => {
      if (!problemCache.has(problemId)) {
        problemCache.set(problemId, await this.store.problems.get(problemId));
      }
      return problemCache.get(problemId)?.triggeredByClass ?? null;
    };

    const vehicleBuckets = new Map<string, SolutionRollupBucket>();
    const familyBuckets = new Map<string, SolutionRollupBucket>();

    const ingest = async (
      decisions: DecisionRecord[],
      into: Map<string, SolutionRollupBucket>,
      scope: "vehicle" | "engineFamily",
    ) => {
      for (const d of decisions) {
        if (!d.outcome) continue;
        const faultClass = await resolveClass(d.problemId);
        if (filter && faultClass !== filter) continue;
        const k = keyOf({ actionId: d.actionId, faultClass });
        let bucket = into.get(k);
        if (!bucket) {
          bucket = emptyBucket(d.actionId, faultClass, scope, vehicle.engineFamily);
          into.set(k, bucket);
        }
        bump(bucket, d.outcome.status, d.decidedAt);
      }
    };

    await ingest(await this.store.decisions.listByVehicle(vehicleId), vehicleBuckets, "vehicle");

    for (const id of familyVehicleIds) {
      await ingest(await this.store.decisions.listByVehicle(id), familyBuckets, "engineFamily");
    }

    return {
      vehicleId,
      engineFamily: vehicle.engineFamily,
      faultClassFilter: filter,
      vehicle: [...vehicleBuckets.values()].sort(rank),
      engineFamilyRollup: [...familyBuckets.values()].sort(rank),
    };
  }
}
