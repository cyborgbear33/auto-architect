/**
 * Read-model: chronological case narrative from durable lifecycleEvents +
 * DecisionRecord repairs. Journal stays the decision audit.
 * Legacy problems without lifecycleEvents fall back to status synthesis.
 */
import type {
  CaseTimeline,
  CaseTimelineEvent,
  CaseTimelineEventType,
  DecisionRecord,
  DiagnosticProblem,
  ProblemLifecycleEvent,
} from "@auto/semantic-types";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";

/** Stable tie-break when several events share a timestamp. */
const TYPE_ORDER: Record<CaseTimelineEventType, number> = {
  opened: 0,
  ranked: 1,
  repair_logged: 2,
  verify_started: 3,
  verify_result: 4,
  closed_solved: 5,
  abandoned: 6,
  escalated: 7,
  reopened: 8,
};

function eventId(parts: string[]): string {
  return parts.join(":");
}

function summarizeLifecycle(
  event: ProblemLifecycleEvent,
  label: string,
): string {
  switch (event.type) {
    case "opened":
      return `Opened ${label}`;
    case "ranked":
      return `LOGOS ranked next steps${event.solutionKind ? ` (${event.solutionKind})` : ""}`;
    case "verify_started":
      return `Verify started for ${label}`;
    case "verify_result":
      return `Verify ${event.verifyResult ?? "done"}${event.note ? `: ${event.note}` : ""}`;
    case "closed_solved":
      return `Closed solved — ${label}`;
    case "abandoned":
      return `Abandoned ${label}`;
    case "escalated":
      return `Escalated ${label}`;
    case "reopened":
      return `Reopened ${label}`;
    default:
      return label;
  }
}

function repairEvents(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
): CaseTimelineEvent[] {
  const base = {
    problemId: problem.id,
    vehicleId: problem.vehicleId,
    faultClass: problem.triggeredByClass,
  };
  return decisions
    .filter((d) => d.problemId === problem.id)
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .map((d) => {
      const outcomeBit = d.outcome ? ` — ${d.outcome.status}` : "";
      return {
        ...base,
        id: eventId([problem.id, "repair_logged", d.id]),
        type: "repair_logged" as const,
        at: d.decidedAt,
        summary: `Logged repair ${d.actionId}${outcomeBit}`,
        actionId: d.actionId,
        outcomeStatus: d.outcome?.status,
        decisionId: d.id,
        note: d.rationale,
      };
    });
}

/** Preferred path: durable lifecycle stamps + decisions. */
function eventsFromLifecycleLog(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
): CaseTimelineEvent[] {
  const label = problem.triggeredByClass ?? "manual case";
  const base = {
    problemId: problem.id,
    vehicleId: problem.vehicleId,
    faultClass: problem.triggeredByClass,
  };
  const life = (problem.lifecycleEvents ?? []).map((e) => ({
    ...base,
    id: e.id,
    type: e.type as CaseTimelineEventType,
    at: e.at,
    summary: summarizeLifecycle(e, label),
    verifyResult: e.verifyResult,
    reopenedFromId: e.reopenedFromId,
    note: e.note,
    solutionKind: e.solutionKind,
  }));
  return [...life, ...repairEvents(problem, decisions)];
}

/** Legacy problems created before lifecycleEvents existed. */
function eventsLegacy(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
): CaseTimelineEvent[] {
  const base = {
    problemId: problem.id,
    vehicleId: problem.vehicleId,
    faultClass: problem.triggeredByClass,
  };
  const label = problem.triggeredByClass ?? "manual case";
  const out: CaseTimelineEvent[] = [
    {
      ...base,
      id: eventId([problem.id, "opened", problem.createdAt]),
      type: "opened",
      at: problem.createdAt,
      summary: `Opened ${label}`,
    },
    ...repairEvents(problem, decisions),
  ];

  if (problem.verification?.startedAt) {
    out.push({
      ...base,
      id: eventId([problem.id, "verify_started", problem.verification.startedAt]),
      type: "verify_started",
      at: problem.verification.startedAt,
      summary: `Verify started for ${label}`,
    });
  }
  if (problem.verification?.completedAt && problem.verification.result) {
    out.push({
      ...base,
      id: eventId([problem.id, "verify_result", problem.verification.completedAt]),
      type: "verify_result",
      at: problem.verification.completedAt,
      summary: `Verify ${problem.verification.result}${
        problem.verification.note ? `: ${problem.verification.note}` : ""
      }`,
      verifyResult: problem.verification.result,
      note: problem.verification.note,
    });
  }
  if (problem.status === "solved") {
    const at = problem.verification?.completedAt ?? problem.updatedAt;
    out.push({
      ...base,
      id: eventId([problem.id, "closed_solved", at]),
      type: "closed_solved",
      at,
      summary: `Closed solved — ${label}`,
      verifyResult: problem.verification?.result,
    });
  } else if (problem.status === "abandoned") {
    out.push({
      ...base,
      id: eventId([problem.id, "abandoned", problem.updatedAt]),
      type: "abandoned",
      at: problem.updatedAt,
      summary: `Abandoned ${label}`,
    });
  } else if (problem.status === "escalated") {
    out.push({
      ...base,
      id: eventId([problem.id, "escalated", problem.updatedAt]),
      type: "escalated",
      at: problem.updatedAt,
      summary: `Escalated ${label}`,
    });
  } else if (
    problem.reopenedFromId &&
    (problem.status === "open" ||
      problem.status === "analyzing" ||
      problem.status === "verifying")
  ) {
    out.push({
      ...base,
      id: eventId([problem.id, "reopened", problem.updatedAt]),
      type: "reopened",
      at: problem.updatedAt,
      summary: `Reopened ${label}`,
      reopenedFromId: problem.reopenedFromId,
    });
  }
  return out;
}

function eventsForProblem(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
): CaseTimelineEvent[] {
  if (problem.lifecycleEvents && problem.lifecycleEvents.length > 0) {
    return eventsFromLifecycleLog(problem, decisions);
  }
  return eventsLegacy(problem, decisions);
}

export class CaseTimelineService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async forVehicle(vehicleId: string, problemIdFilter?: string | null): Promise<CaseTimeline> {
    await this.vehicles.getOrThrow(vehicleId);
    const filter = problemIdFilter?.trim() || null;

    let problems = await this.store.problems.listByVehicle(vehicleId);
    if (filter) {
      problems = problems.filter((p) => p.id === filter);
    }

    const decisions = await this.store.decisions.listByVehicle(vehicleId);
    const events = problems
      .flatMap((p) => eventsForProblem(p, decisions))
      .sort((a, b) => {
        const cmp = a.at.localeCompare(b.at);
        if (cmp !== 0) return cmp;
        const typeCmp = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
        if (typeCmp !== 0) return typeCmp;
        return a.id.localeCompare(b.id);
      });

    return {
      vehicleId,
      problemIdFilter: filter,
      events,
    };
  }
}
