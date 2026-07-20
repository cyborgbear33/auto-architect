import { draftForClass } from "@auto/cartridges";
import { getSpecialProcedure } from "@auto/ontology";
import type {
  DecisionRecord,
  DiagnosticProblem,
  ProblemLifecycleEvent,
  ProblemStatus,
} from "@auto/semantic-types";
import type {
  CompleteSpecialProcedureInput,
  CreateDiagnosticProblemInput,
  LogRepairInput,
  ProblemIdActionInput,
  StartSpecialProcedureInput,
} from "@auto/validation";
import { conflict, notFound, policyBlocked, validationError } from "../lib/errors.ts";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import { applyCalibration, calibratePlaybook } from "./calibration.ts";
import type { PolicyService } from "./policy.ts";
import type { RecognitionService } from "./recognition.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { SolverService } from "./solver.ts";
import type { VehicleService } from "./vehicle.ts";

const REOPENABLE: ReadonlySet<ProblemStatus> = new Set(["solved", "abandoned", "escalated"]);

type LifecycleStamp = Omit<ProblemLifecycleEvent, "id" | "at" | "odometerMiles" | "sessionId"> & {
  at?: string;
};

/**
 * The mutation gate. Every state-changing operation in auto-architect goes
 * through here — never a direct store write from a route handler — so policy
 * checks (PolicyService) and the audit trail (DecisionRecord) are structural,
 * not opt-in. Mirrors garden-architect's ActionService role exactly.
 */
export class ActionService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private policy: PolicyService,
    private solver: SolverService,
    private solutionHistory: SolutionHistoryService,
  ) {}

  /** Snapshot vehicle odometer + open drive session for H3 timeline stamps. */
  private async evidenceContext(vehicleId: string): Promise<{
    odometerMiles?: number;
    sessionId?: string;
  }> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const open = (await this.store.sessions.listByVehicle(vehicleId)).find((s) => !s.endedAt);
    return {
      ...(vehicle.odometerMiles !== undefined ? { odometerMiles: vehicle.odometerMiles } : {}),
      ...(open ? { sessionId: open.id } : {}),
    };
  }

  private async makeLifecycleEvent(
    vehicleId: string,
    stamp: LifecycleStamp,
  ): Promise<ProblemLifecycleEvent> {
    const ctx = await this.evidenceContext(vehicleId);
    return {
      id: newId("life"),
      at: stamp.at ?? nowIso(),
      type: stamp.type,
      ...ctx,
      ...(stamp.note ? { note: stamp.note } : {}),
      ...(stamp.verifyResult ? { verifyResult: stamp.verifyResult } : {}),
      ...(stamp.reopenedFromId ? { reopenedFromId: stamp.reopenedFromId } : {}),
      ...(stamp.solutionKind ? { solutionKind: stamp.solutionKind } : {}),
    };
  }

  private async stampLifecycle(
    problem: DiagnosticProblem,
    stamp: LifecycleStamp,
  ): Promise<ProblemLifecycleEvent[]> {
    const event = await this.makeLifecycleEvent(problem.vehicleId, stamp);
    return [...(problem.lifecycleEvents ?? []), event];
  }

  /**
   * Draft a DiagnosticProblem either from a proven fault class (auto-framed by
   * the vehicle's cartridges) or from a manually authored statement/actions.
   */
  async createDiagnosticProblem(
    input: CreateDiagnosticProblemInput & { triggeredByClass?: string },
  ): Promise<DiagnosticProblem> {
    const vehicle = await this.vehicles.getOrThrow(input.vehicleId);
    const now = nowIso();
    const opened = await this.makeLifecycleEvent(vehicle.id, { type: "opened", at: now });

    if (input.triggeredByClass) {
      const cartridges = this.vehicles.cartridgesFor(vehicle);
      const vehicleView = {
        vehicleId: vehicle.id,
        label: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`
          .replace(/\s+/g, " ")
          .trim(),
        engineFamily: vehicle.engineFamily,
        dtcs: await this.store.observations.latestDtcs(vehicle.id),
        pids: await this.store.observations.latestPids(vehicle.id),
      };
      const draft = draftForClass(vehicleView, input.triggeredByClass, cartridges);
      if (!draft) {
        throw validationError(
          `No cartridge loaded for vehicle "${vehicle.id}" frames class "${input.triggeredByClass}".`,
        );
      }
      const history = await this.solutionHistory.forVehicle(vehicle.id, input.triggeredByClass);
      const calibration = calibratePlaybook({
        faultClass: input.triggeredByClass,
        actions: draft.actions,
        history,
        urgency: draft.statement.urgency,
      });
      const problem: DiagnosticProblem = {
        id: newId("problem"),
        vehicleId: vehicle.id,
        status: "open",
        statement: draft.statement,
        problemType: "Diagnostic",
        gapType: draft.gapType,
        desiredState: draft.desiredState,
        actions: applyCalibration(draft.actions, calibration),
        triggeredByClass: input.triggeredByClass,
        lifecycleEvents: [opened],
        createdAt: now,
        updatedAt: now,
      };
      return this.store.problems.create(problem);
    }

    const problem: DiagnosticProblem = {
      id: newId("problem"),
      vehicleId: vehicle.id,
      status: "open",
      statement: input.statement,
      problemType: "Diagnostic",
      gapType: input.gapType,
      actions: input.actions,
      lifecycleEvents: [opened],
      createdAt: now,
      updatedAt: now,
    };
    return this.store.problems.create(problem);
  }

  async solveDiagnosticProblem(problemId: string): Promise<DiagnosticProblem> {
    const problem = await this.store.problems.get(problemId);
    if (!problem) throw notFound("DiagnosticProblem", problemId);

    let actions = problem.actions;
    if (problem.triggeredByClass && actions.length > 0) {
      const history = await this.solutionHistory.forVehicle(
        problem.vehicleId,
        problem.triggeredByClass,
      );
      const calibration = calibratePlaybook({
        faultClass: problem.triggeredByClass,
        actions,
        history,
        urgency: problem.statement.urgency,
      });
      actions = applyCalibration(actions, calibration);
    }

    const solution = await this.solver.solve({ ...problem, actions });
    const now = nowIso();
    const status = solution.kind === "escalate" ? "escalated" : "analyzing";
    let lifecycleEvents = await this.stampLifecycle(problem, {
      type: "ranked",
      at: now,
      solutionKind: solution.kind,
      note: solution.rationale,
    });
    if (status === "escalated") {
      lifecycleEvents = [
        ...lifecycleEvents,
        await this.makeLifecycleEvent(problem.vehicleId, {
          type: "escalated",
          at: now,
          note: "Escalated by LOGOS solve",
          solutionKind: solution.kind,
        }),
      ];
    }
    return this.store.problems.update(problemId, {
      solution,
      status,
      actions,
      lifecycleEvents,
    });
  }

  async getDiagnosticProblem(problemId: string): Promise<DiagnosticProblem> {
    const problem = await this.store.problems.get(problemId);
    if (!problem) throw notFound("DiagnosticProblem", problemId);
    return problem;
  }

  async listDiagnosticProblems(vehicleId: string): Promise<DiagnosticProblem[]> {
    return this.store.problems.listByVehicle(vehicleId);
  }

  /**
   * The safety-hold demo the plan calls out explicitly: a real policy gate,
   * not a UI suggestion. Throws `policyBlocked` (403) when a dangerous fault
   * class is currently proven for this vehicle.
   */
  async requestClearCodesAndDrive(
    vehicleId: string,
  ): Promise<{ allowed: true; obligations: string[] }> {
    const recognition = await this.recognition.recognize(vehicleId);
    const evaluation = await this.policy.evaluate(vehicleId, recognition.member);
    const check = this.policy.isActionForbidden(evaluation, "clear-codes-and-drive");
    if (check.forbidden) {
      throw policyBlocked(check.reason ?? "Blocked by policy.", {
        obligations: evaluation.obligations,
        provenClasses: recognition.member,
      });
    }
    return { allowed: true, obligations: evaluation.obligations };
  }

  /**
   * Log an actual repair/diagnostic action. A `worked` outcome moves the case
   * to `verifying` (not solved) — close only after `verifyDiagnosticProblem`.
   */
  async logRepair(input: LogRepairInput): Promise<DecisionRecord> {
    const problem = await this.store.problems.get(input.problemId);
    if (!problem) throw notFound("DiagnosticProblem", input.problemId);
    if (problem.status === "abandoned") {
      throw conflict("Cannot log a repair on an abandoned problem — reopen it first.");
    }

    const now = nowIso();
    const outcome = input.outcomeStatus
      ? {
          status: input.outcomeStatus,
          recordedAt: now,
          recordedBy: input.decidedBy,
          action: input.actionId,
          note: input.note,
        }
      : undefined;

    let nextStatus: ProblemStatus = problem.status;
    let verification = problem.verification;
    let lifecycleEvents = problem.lifecycleEvents;
    const ctx = await this.evidenceContext(input.vehicleId);
    if (outcome?.status === "worked") {
      nextStatus = "verifying";
      verification = { startedAt: now };
      lifecycleEvents = await this.stampLifecycle(problem, {
        type: "verify_started",
        at: now,
        note: `After repair ${input.actionId}`,
      });
    } else if (outcome && (problem.status === "open" || problem.status === "analyzing")) {
      nextStatus = "analyzing";
    }

    await this.store.problems.update(input.problemId, {
      status: nextStatus,
      ...(outcome ? { outcome } : {}),
      ...(verification ? { verification } : {}),
      ...(lifecycleEvents ? { lifecycleEvents } : {}),
    });

    const decision: DecisionRecord = {
      id: newId("decision"),
      vehicleId: input.vehicleId,
      problemId: input.problemId,
      actionId: input.actionId,
      rationale: input.rationale,
      policyAllowed: true,
      decidedAt: now,
      decidedBy: input.decidedBy,
      outcome,
      ...ctx,
    };
    return this.store.decisions.create(decision);
  }

  /**
   * Post-repair verify: re-run recognition. If the triggering class is gone,
   * mark solved; if still proven, fail verify and reopen the case.
   */
  async verifyDiagnosticProblem(input: ProblemIdActionInput): Promise<DiagnosticProblem> {
    const problem = await this.requireProblem(input.problemId);
    if (problem.status !== "verifying") {
      throw conflict(
        `Verify only applies to problems in "verifying" status (currently "${problem.status}").`,
      );
    }

    const recognition = await this.recognition.recognize(problem.vehicleId);
    const className = problem.triggeredByClass;
    const stillProven = className
      ? recognition.member.includes(className) || recognition.mostSpecific.includes(className)
      : false;
    const now = nowIso();
    const criteria = problem.desiredState?.successCriteria;

    if (!className) {
      const note = input.note ?? "Manual case verified by operator (no triggeredByClass).";
      let lifecycleEvents = await this.stampLifecycle(problem, {
        type: "verify_result",
        at: now,
        verifyResult: "passed",
        note,
      });
      lifecycleEvents = [
        ...lifecycleEvents,
        await this.makeLifecycleEvent(problem.vehicleId, {
          type: "closed_solved",
          at: now,
          verifyResult: "passed",
          note,
        }),
      ];
      return this.store.problems.update(problem.id, {
        status: "solved",
        verification: {
          startedAt: problem.verification?.startedAt ?? now,
          completedAt: now,
          result: "passed",
          note,
          stillProven: [],
        },
        lifecycleEvents,
      });
    }

    if (stillProven) {
      const note =
        input.note ??
        `${className} still proven after repair` +
          (criteria ? ` — success criteria: ${criteria}` : "");
      return this.store.problems.update(problem.id, {
        status: "open",
        verification: {
          startedAt: problem.verification?.startedAt ?? now,
          completedAt: now,
          result: "failed",
          stillProven: [className],
          note,
        },
        lifecycleEvents: await this.stampLifecycle(problem, {
          type: "verify_result",
          at: now,
          verifyResult: "failed",
          note,
        }),
      });
    }

    const note =
      input.note ??
      `${className} no longer proven` + (criteria ? ` — success criteria: ${criteria}` : "");
    let lifecycleEvents = await this.stampLifecycle(problem, {
      type: "verify_result",
      at: now,
      verifyResult: "passed",
      note,
    });
    lifecycleEvents = [
      ...lifecycleEvents,
      await this.makeLifecycleEvent(problem.vehicleId, {
        type: "closed_solved",
        at: now,
        verifyResult: "passed",
        note,
      }),
    ];
    return this.store.problems.update(problem.id, {
      status: "solved",
      verification: {
        startedAt: problem.verification?.startedAt ?? now,
        completedAt: now,
        result: "passed",
        stillProven: [],
        note,
      },
      lifecycleEvents,
    });
  }

  async abandonDiagnosticProblem(input: ProblemIdActionInput): Promise<DiagnosticProblem> {
    const problem = await this.requireProblem(input.problemId);
    if (problem.status === "solved") {
      throw conflict("Solved problems are closed — reopen if you need to abandon a mistaken case.");
    }
    if (problem.status === "abandoned") return problem;
    const now = nowIso();
    return this.store.problems.update(problem.id, {
      status: "abandoned",
      lifecycleEvents: await this.stampLifecycle(problem, {
        type: "abandoned",
        at: now,
        note: input.note,
      }),
    });
  }

  async escalateDiagnosticProblem(input: ProblemIdActionInput): Promise<DiagnosticProblem> {
    const problem = await this.requireProblem(input.problemId);
    if (problem.status === "escalated") return problem;
    if (problem.status === "solved" || problem.status === "abandoned") {
      throw conflict(`Cannot escalate a "${problem.status}" problem — reopen it first.`);
    }
    const now = nowIso();
    return this.store.problems.update(problem.id, {
      status: "escalated",
      lifecycleEvents: await this.stampLifecycle(problem, {
        type: "escalated",
        at: now,
        note: input.note,
      }),
    });
  }

  /**
   * Reopen a closed case in-place with lineage (`reopenedFromId` points at self
   * history via prior status — we stamp the previous id as lineage anchor).
   */
  async reopenDiagnosticProblem(input: ProblemIdActionInput): Promise<DiagnosticProblem> {
    const problem = await this.requireProblem(input.problemId);
    if (!REOPENABLE.has(problem.status)) {
      throw conflict(
        `Only solved/abandoned/escalated problems can be reopened (currently "${problem.status}").`,
      );
    }
    const now = nowIso();
    const reopenedFromId = problem.reopenedFromId ?? problem.id;
    return this.store.problems.update(problem.id, {
      status: "open",
      reopenedFromId,
      verification: undefined,
      lifecycleEvents: await this.stampLifecycle(problem, {
        type: "reopened",
        at: now,
        reopenedFromId,
        note: input.note,
      }),
    });
  }

  async listDecisions(vehicleId: string): Promise<DecisionRecord[]> {
    return this.store.decisions.listByVehicle(vehicleId);
  }

  /**
   * Start a guided special procedure (e.g. Proxi). Opens a diagnostic case and
   * writes a Journal decision. Does not send bi-directional OBD commands.
   */
  async startSpecialProcedure(input: StartSpecialProcedureInput): Promise<{
    problem: DiagnosticProblem;
    decision: DecisionRecord;
    procedureId: string;
  }> {
    const vehicle = await this.vehicles.getOrThrow(input.vehicleId);
    const proc = getSpecialProcedure(input.procedureId);
    if (!proc || proc.engineFamily !== vehicle.engineFamily) {
      throw notFound("SpecialProcedure", input.procedureId);
    }
    if (proc.executionMode !== "external_enhanced_tool") {
      throw validationError(
        `Procedure "${proc.id}" execution mode "${proc.executionMode}" is not supported.`,
      );
    }

    const problem = await this.createDiagnosticProblem({
      vehicleId: vehicle.id,
      gapType: "coordination",
      statement: {
        currentState: `Guided run started: ${proc.title}. Modules may be out of Proxi sync with the BCM.`,
        desiredState: `${proc.title} completed via external enhanced tool (AlfaOBD/wiTECH + OBDLink MX+); vehicle shifts and mismatch symptoms cleared.`,
        gap: proc.summary.slice(0, 400),
        whyItMatters:
          "Proxi mismatch commonly leaves FCA next-gen vehicles stuck in Park after battery events.",
        urgency: "high",
      },
      actions: [
        {
          id: proc.id,
          description: `Run ${proc.title} externally (AlfaOBD / wiTECH)`,
          firstStep:
            "Follow Functions checklist: detect out-of-sync modules, align via body computer PROXI, verify. Gray adapter when the tool prompts.",
          cost: 0.2,
          risk: 0.35,
          reversibility: 0.1,
        },
      ],
    });

    const now = nowIso();
    const ctx = await this.evidenceContext(vehicle.id);
    const decision: DecisionRecord = {
      id: newId("decision"),
      vehicleId: vehicle.id,
      problemId: problem.id,
      actionId: `${proc.id}:started`,
      rationale: input.note?.trim()
        ? `Started guided ${proc.title}. ${input.note.trim()}`
        : `Started guided ${proc.title} (external enhanced tool — not gateway bi-directional).`,
      policyAllowed: true,
      decidedAt: now,
      decidedBy: input.decidedBy,
      ...ctx,
    };
    await this.store.decisions.create(decision);
    return { problem, decision, procedureId: proc.id };
  }

  /**
   * Mark a guided special-procedure run completed or failed; closes the case
   * with a Journal decision (still no OBD gateway write).
   */
  async completeSpecialProcedure(input: CompleteSpecialProcedureInput): Promise<{
    problem: DiagnosticProblem;
    decision: DecisionRecord;
  }> {
    const vehicle = await this.vehicles.getOrThrow(input.vehicleId);
    const proc = getSpecialProcedure(input.procedureId);
    if (!proc || proc.engineFamily !== vehicle.engineFamily) {
      throw notFound("SpecialProcedure", input.procedureId);
    }
    const problem = await this.requireProblem(input.problemId);
    if (problem.vehicleId !== vehicle.id) {
      throw validationError("Procedure problem belongs to a different vehicle.");
    }

    const now = nowIso();
    const worked = input.status === "completed";
    const outcomeStatus = worked ? "worked" : "failed";
    const nextStatus: ProblemStatus = worked ? "solved" : "abandoned";
    const lifecycleEvents = await this.stampLifecycle(problem, {
      type: worked ? "closed_solved" : "abandoned",
      at: now,
      note: input.note,
      verifyResult: worked ? "passed" : "failed",
    });

    const updated = await this.store.problems.update(problem.id, {
      status: nextStatus,
      outcome: {
        status: outcomeStatus,
        recordedAt: now,
        recordedBy: input.decidedBy,
        action: `${proc.id}:${input.status}`,
        note: input.note,
      },
      lifecycleEvents,
    });

    const ctx = await this.evidenceContext(vehicle.id);
    const decision: DecisionRecord = {
      id: newId("decision"),
      vehicleId: vehicle.id,
      problemId: problem.id,
      actionId: `${proc.id}:${input.status}`,
      rationale: input.note?.trim()
        ? `Guided ${proc.title} ${input.status}. ${input.note.trim()}`
        : `Guided ${proc.title} marked ${input.status}.`,
      policyAllowed: true,
      decidedAt: now,
      decidedBy: input.decidedBy,
      outcome: updated.outcome,
      ...ctx,
    };
    await this.store.decisions.create(decision);
    return { problem: updated, decision };
  }

  private async requireProblem(problemId: string): Promise<DiagnosticProblem> {
    const problem = await this.store.problems.get(problemId);
    if (!problem) throw notFound("DiagnosticProblem", problemId);
    return problem;
  }
}
