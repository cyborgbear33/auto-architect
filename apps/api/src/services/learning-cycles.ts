/**
 * Read-model: one LearningCycle per DiagnosticProblem that has left pure draft.
 * Compose-only — no cycle table. Feeds Diagnosis / ProblemDetail / reports.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  LearningCycle,
  LearningCycleList,
  Recommendation,
} from "@auto/semantic-types";
import type { Store } from "../store/index.ts";
import { bestCalibrationMeta, calibratePlaybook } from "./calibration.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

function lifecycleAt(problem: DiagnosticProblem, type: string): string | undefined {
  return problem.lifecycleEvents?.find((e) => e.type === type)?.at;
}

function isCycleWorthy(problem: DiagnosticProblem, decisions: DecisionRecord[]): boolean {
  if (problem.solution) return true;
  if (problem.outcome) return true;
  if (problem.verification) return true;
  if (problem.reopenedFromId) return true;
  if (decisions.some((d) => d.problemId === problem.id)) return true;
  const life = problem.lifecycleEvents ?? [];
  return life.some((e) => e.type !== "opened");
}

async function composeCycle(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
  recommendations: Recommendation[],
  historyForClass: (faultClass: string) => ReturnType<SolutionHistoryService["forVehicle"]>,
): Promise<LearningCycle> {
  const problemDecisions = decisions
    .filter((d) => d.problemId === problem.id)
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));

  const repairedAt =
    lifecycleAt(problem, "verify_started") ??
    problemDecisions.find((d) => d.outcome)?.decidedAt ??
    problemDecisions[0]?.decidedAt;
  const verifiedAt =
    lifecycleAt(problem, "verify_result") ??
    lifecycleAt(problem, "closed_solved") ??
    problem.verification?.completedAt;

  let priorDelta: LearningCycle["priorDelta"];
  if (problem.triggeredByClass && problem.actions.length > 0) {
    const history = await historyForClass(problem.triggeredByClass);
    const calibration = calibratePlaybook({
      faultClass: problem.triggeredByClass,
      actions: problem.actions,
      history,
      urgency: problem.statement.urgency,
    });
    const meta = bestCalibrationMeta(calibration);
    if (meta) {
      priorDelta = {
        ...meta,
        ...(calibration.explain ? { explain: calibration.explain } : {}),
      };
    }
  } else {
    const stamped = problem.actions.find((a) => a.calibrationMeta)?.calibrationMeta;
    if (stamped) priorDelta = stamped;
  }

  const linkedRecommendationIds = recommendations
    .filter(
      (r) =>
        r.generatedByProblem === problem.id ||
        (problem.triggeredByClass !== undefined &&
          r.generatedFromClasses.includes(problem.triggeredByClass)),
    )
    .map((r) => r.id);

  return {
    id: problem.id,
    vehicleId: problem.vehicleId,
    ...(problem.triggeredByClass ? { faultClass: problem.triggeredByClass } : {}),
    status: problem.status,
    openedAt: lifecycleAt(problem, "opened") ?? problem.createdAt,
    ...(lifecycleAt(problem, "ranked") ? { rankedAt: lifecycleAt(problem, "ranked") } : {}),
    ...(repairedAt ? { repairedAt } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
    decisionIds: problemDecisions.map((d) => d.id),
    ...(problem.outcome ? { outcome: problem.outcome } : {}),
    ...(problem.verification ? { verification: problem.verification } : {}),
    ...(problem.reopenedFromId ? { reopenedFromId: problem.reopenedFromId } : {}),
    ...(priorDelta ? { priorDelta } : {}),
    ...(linkedRecommendationIds.length > 0 ? { linkedRecommendationIds } : {}),
  };
}

export class LearningCycleService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private solutionHistory: SolutionHistoryService,
  ) {}

  async forVehicle(vehicleId: string, problemIdFilter?: string): Promise<LearningCycleList> {
    await this.vehicles.getOrThrow(vehicleId);
    let problems = await this.store.problems.listByVehicle(vehicleId);
    if (problemIdFilter) {
      problems = problems.filter((p) => p.id === problemIdFilter);
    }
    const decisions = await this.store.decisions.listByVehicle(vehicleId);
    const recommendations = await this.store.recommendations.listByVehicle(vehicleId);

    /** One history fetch per fault class — avoids N+1 across cycles. */
    const historyByClass = new Map<
      string,
      Awaited<ReturnType<SolutionHistoryService["forVehicle"]>>
    >();
    const historyForClass = async (faultClass: string) => {
      const cached = historyByClass.get(faultClass);
      if (cached) return cached;
      const history = await this.solutionHistory.forVehicle(vehicleId, faultClass);
      historyByClass.set(faultClass, history);
      return history;
    };

    const cycles: LearningCycle[] = [];
    for (const problem of problems) {
      if (!isCycleWorthy(problem, decisions)) continue;
      cycles.push(await composeCycle(problem, decisions, recommendations, historyForClass));
    }

    cycles.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return {
      vehicleId,
      problemIdFilter: problemIdFilter ?? null,
      cycles,
    };
  }
}
