/**
 * Read-model: derive a chronological case narrative from DiagnosticProblem +
 * DecisionRecord. Journal stays the decision audit; this is the case story.
 * Lifecycle stamps without a dedicated event log are best-effort (updatedAt).
 */
import type {
  CaseTimeline,
  CaseTimelineEvent,
  CaseTimelineEventType,
  DecisionRecord,
  DiagnosticProblem,
} from "@auto/semantic-types";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";

/** Stable tie-break when several events share a timestamp. */
const TYPE_ORDER: Record<CaseTimelineEventType, number> = {
  opened: 0,
  repair_logged: 1,
  verify_started: 2,
  verify_result: 3,
  closed_solved: 4,
  abandoned: 5,
  escalated: 6,
  reopened: 7,
};

function eventId(parts: string[]): string {
  return parts.join(":");
}

function eventsForProblem(
  problem: DiagnosticProblem,
  decisions: DecisionRecord[],
): CaseTimelineEvent[] {
  const base = {
    problemId: problem.id,
    vehicleId: problem.vehicleId,
    faultClass: problem.triggeredByClass,
  };
  const label = problem.triggeredByClass ?? "manual case";
  const out: CaseTimelineEvent[] = [];

  out.push({
    ...base,
    id: eventId([problem.id, "opened", problem.createdAt]),
    type: "opened",
    at: problem.createdAt,
    summary: `Opened ${label}`,
  });

  const problemDecisions = decisions
    .filter((d) => d.problemId === problem.id)
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));

  for (const d of problemDecisions) {
    const outcomeBit = d.outcome ? ` — ${d.outcome.status}` : "";
    out.push({
      ...base,
      id: eventId([problem.id, "repair_logged", d.id]),
      type: "repair_logged",
      at: d.decidedAt,
      summary: `Logged repair ${d.actionId}${outcomeBit}`,
      actionId: d.actionId,
      outcomeStatus: d.outcome?.status,
      decisionId: d.id,
      note: d.rationale,
    });
  }

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
