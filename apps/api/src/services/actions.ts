import { draftForClass } from "@auto/cartridges";
import type { DecisionRecord, DiagnosticProblem } from "@auto/semantic-types";
import type { CreateDiagnosticProblemInput, LogRepairInput } from "@auto/validation";
import type { Store } from "../store/index.ts";
import type { VehicleService } from "./vehicle.ts";
import type { RecognitionService } from "./recognition.ts";
import type { PolicyService } from "./policy.ts";
import type { SolverService } from "./solver.ts";
import { newId, nowIso } from "../lib/ids.ts";
import { notFound, policyBlocked, validationError } from "../lib/errors.ts";

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
  ) {}

  /**
   * Draft a DiagnosticProblem either from a proven fault class (auto-framed by
   * the vehicle's cartridges) or from a manually authored statement/actions.
   */
  async createDiagnosticProblem(
    input: CreateDiagnosticProblemInput & { triggeredByClass?: string },
  ): Promise<DiagnosticProblem> {
    const vehicle = await this.vehicles.getOrThrow(input.vehicleId);
    const now = nowIso();

    if (input.triggeredByClass) {
      const cartridges = this.vehicles.cartridgesFor(vehicle);
      const vehicleView = {
        vehicleId: vehicle.id,
        label: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`.replace(/\s+/g, " ").trim(),
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
      const problem: DiagnosticProblem = {
        id: newId("problem"),
        vehicleId: vehicle.id,
        status: "open",
        statement: draft.statement,
        problemType: "Diagnostic",
        gapType: draft.gapType,
        desiredState: draft.desiredState,
        actions: draft.actions,
        triggeredByClass: input.triggeredByClass,
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
      createdAt: now,
      updatedAt: now,
    };
    return this.store.problems.create(problem);
  }

  async solveDiagnosticProblem(problemId: string): Promise<DiagnosticProblem> {
    const problem = await this.store.problems.get(problemId);
    if (!problem) throw notFound("DiagnosticProblem", problemId);
    const solution = await this.solver.solve(problem);
    const status = solution.kind === "escalate" ? "escalated" : "analyzing";
    return this.store.problems.update(problemId, { solution, status });
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
  async requestClearCodesAndDrive(vehicleId: string): Promise<{ allowed: true; obligations: string[] }> {
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

  /** Log an actual repair/diagnostic action taken and its outcome — the L4 learning signal. */
  async logRepair(input: LogRepairInput): Promise<DecisionRecord> {
    const problem = await this.store.problems.get(input.problemId);
    if (!problem) throw notFound("DiagnosticProblem", input.problemId);

    const now = nowIso();
    const outcome = input.outcomeStatus
      ? { status: input.outcomeStatus, recordedAt: now, recordedBy: input.decidedBy, action: input.actionId, note: input.note }
      : undefined;

    await this.store.problems.update(input.problemId, {
      status: outcome?.status === "worked" ? "solved" : problem.status,
      ...(outcome ? { outcome } : {}),
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
    };
    return this.store.decisions.create(decision);
  }

  async listDecisions(vehicleId: string): Promise<DecisionRecord[]> {
    return this.store.decisions.listByVehicle(vehicleId);
  }
}
