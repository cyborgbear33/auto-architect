/**
 * Read-model: aggregate DecisionRecord + ProblemOutcome into "what worked"
 * buckets and apprentice narrative cards (X6). Does not mutate store state.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  OutcomeStatus,
  SolutionHistory,
  SolutionNarrativeCard,
  SolutionNarrativeVerify,
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

export function verifyFromProblem(problem: DiagnosticProblem | undefined): SolutionNarrativeVerify {
  if (!problem) return "none";
  if (problem.verification?.result) return problem.verification.result;
  if (problem.status === "verifying") return "pending";
  return "none";
}

/** Fluent apprentice lesson — action → class → outcome → verify → why believed. */
export function composeSolutionLesson(input: {
  actionId: string;
  faultClass: string | null;
  outcome: OutcomeStatus;
  verify: SolutionNarrativeVerify;
  whyBelieved: string;
}): string {
  const cls = input.faultClass ?? "unscoped case";
  const verifyBit =
    input.verify === "none"
      ? "verify not recorded"
      : input.verify === "pending"
        ? "verify pending"
        : `verify ${input.verify}`;
  const why = input.whyBelieved.trim() || "no rationale logged";
  return `${input.actionId} → ${cls} → ${input.outcome} → ${verifyBit} — why believed: ${why}`;
}

export function narrativeFromDecision(
  d: DecisionRecord,
  faultClass: string | null,
  problem: DiagnosticProblem | undefined,
): SolutionNarrativeCard | null {
  if (!d.outcome) return null;
  const verify = verifyFromProblem(problem);
  const whyBelieved = d.outcome.note?.trim() || d.rationale.trim() || "no rationale logged";
  return {
    decisionId: d.id,
    problemId: d.problemId,
    actionId: d.actionId,
    faultClass,
    outcome: d.outcome.status,
    verify,
    whyBelieved,
    decidedAt: d.decidedAt,
    lesson: composeSolutionLesson({
      actionId: d.actionId,
      faultClass,
      outcome: d.outcome.status,
      verify,
      whyBelieved,
    }),
  };
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
    const resolveProblem = async (problemId: string): Promise<DiagnosticProblem | undefined> => {
      if (!problemCache.has(problemId)) {
        problemCache.set(problemId, await this.store.problems.get(problemId));
      }
      return problemCache.get(problemId);
    };

    const vehicleBuckets = new Map<string, SolutionRollupBucket>();
    const familyBuckets = new Map<string, SolutionRollupBucket>();
    const narratives: SolutionNarrativeCard[] = [];

    const ingest = async (
      decisions: DecisionRecord[],
      into: Map<string, SolutionRollupBucket>,
      scope: "vehicle" | "engineFamily",
      collectNarratives: boolean,
    ) => {
      for (const d of decisions) {
        if (!d.outcome) continue;
        const problem = await resolveProblem(d.problemId);
        const faultClass = problem?.triggeredByClass ?? null;
        if (filter && faultClass !== filter) continue;
        const k = keyOf({ actionId: d.actionId, faultClass });
        let bucket = into.get(k);
        if (!bucket) {
          bucket = emptyBucket(d.actionId, faultClass, scope, vehicle.engineFamily);
          into.set(k, bucket);
        }
        bump(bucket, d.outcome.status, d.decidedAt);
        if (collectNarratives) {
          const card = narrativeFromDecision(d, faultClass, problem);
          if (card) narratives.push(card);
        }
      }
    };

    await ingest(await this.store.decisions.listByVehicle(vehicleId), vehicleBuckets, "vehicle", true);

    for (const id of familyVehicleIds) {
      await ingest(await this.store.decisions.listByVehicle(id), familyBuckets, "engineFamily", false);
    }

    narratives.sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : 0));

    return {
      vehicleId,
      engineFamily: vehicle.engineFamily,
      faultClassFilter: filter,
      vehicle: [...vehicleBuckets.values()].sort(rank),
      engineFamilyRollup: [...familyBuckets.values()].sort(rank),
      narratives: narratives.slice(0, 12),
    };
  }
}
