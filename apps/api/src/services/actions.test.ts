import { FakeLogosBridge, type ReasonResult } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore, type Store } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { ActionService } from "./actions.ts";
import { ForecastService } from "./forecast.ts";
import { PolicyService } from "./policy.ts";
import { RecognitionService } from "./recognition.ts";
import { SolutionHistoryService } from "./solution-history.ts";
import { SolverService } from "./solver.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

function forbidWhenMisfire(): (input: { facts: Array<{ formula: string }> }) => ReasonResult {
  return (input) => {
    const misfire = input.facts.some((f) => f.formula.startsWith("MisfireUnderLoad("));
    return {
      derived: misfire
        ? [
            {
              formula: "Forbid(ClearCodesAndDrive(veh_jeep_renegade_2015_latitude))",
              ruleId: "R_forbid_clear_misfire",
              facts: [],
              confidence: 0.9,
            },
          ]
        : [],
      resolutions: [],
      unresolved: [],
      defeated: [],
      unsafe: [],
      realized: [],
      rounds: 1,
      fixpoint: true,
      realizationNote: null,
      realizationUndecided: [],
    };
  };
}

async function makeCtx() {
  const store: Store = createMemoryStore();
  await seed(store);
  const realizer = (input: {
    individual: string;
    abox: { concepts: Record<string, string[]> };
  }) => {
    const hasMisfire = Object.values(input.abox.concepts).flat().includes("CylinderMisfire");
    return {
      individual: input.individual,
      member: hasMisfire ? ["MisfireUnderLoad"] : [],
      mostSpecific: hasMisfire ? ["MisfireUnderLoad"] : [],
      undecided: [],
    };
  };
  const bridge = new FakeLogosBridge(
    undefined,
    realizer,
    undefined,
    undefined,
    forbidWhenMisfire(),
  );
  const vehicles = new VehicleService(store);
  const forecast = new ForecastService(store, bridge);
  const recognition = new RecognitionService(store, bridge, vehicles, forecast);
  const policy = new PolicyService(bridge);
  const solver = new SolverService(bridge);
  const solutionHistory = new SolutionHistoryService(store, vehicles);
  const actions = new ActionService(
    store,
    vehicles,
    recognition,
    policy,
    solver,
    solutionHistory,
  );
  return { store, actions, vehicles };
}

describe("ActionService (the mutation gate)", () => {
  let ctx: Awaited<ReturnType<typeof makeCtx>>;

  beforeEach(async () => {
    ctx = await makeCtx();
  });

  it("drafts a DiagnosticProblem from a proven fault class via cartridge framing", async () => {
    const problem = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    expect(problem.triggeredByClass).toBe("MisfireUnderLoad");
    expect(problem.actions.length).toBeGreaterThan(0);
    expect(problem.desiredState?.successCriteria).toBeTruthy();
    expect(problem.lifecycleEvents?.map((e) => e.type)).toEqual(["opened"]);
  });

  it("rejects a triggeredByClass no loaded cartridge frames", async () => {
    await expect(
      ctx.actions.createDiagnosticProblem({
        vehicleId: JEEP,
        triggeredByClass: "NotARealClass",
        statement: { currentState: "", desiredState: "", gap: "" },
        actions: [],
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("solves a drafted problem and persists the solution", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const solved = await ctx.actions.solveDiagnosticProblem(draft.id);
    expect(solved.solution).toBeDefined();
    expect(solved.status).not.toBe("open");
  });

  it("blocks clear-codes-and-drive with a 403 POLICY_BLOCKED when MisfireUnderLoad is proven", async () => {
    await ctx.store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 90, timestamp: "2026-01-01T00:00:00Z" }],
    });
    await expect(ctx.actions.requestClearCodesAndDrive(JEEP)).rejects.toMatchObject({
      statusCode: 403,
      code: "POLICY_BLOCKED",
    });
  });

  it("allows clear-codes-and-drive when nothing dangerous is proven", async () => {
    const result = await ctx.actions.requestClearCodesAndDrive(JEEP);
    expect(result.allowed).toBe(true);
  });

  it("logs a worked repair into verifying (not solved) with verification started", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const decision = await ctx.actions.logRepair({
      vehicleId: JEEP,
      problemId: draft.id,
      actionId: "swap-coil-plug",
      rationale: "misfire followed the coil to the swap position",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    expect(decision.policyAllowed).toBe(true);
    const problem = await ctx.actions.getDiagnosticProblem(draft.id);
    expect(problem.status).toBe("verifying");
    expect(problem.outcome?.status).toBe("worked");
    expect(problem.verification?.startedAt).toBeTruthy();
  });

  it("verify passes when the triggering class is no longer proven → solved", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await ctx.actions.logRepair({
      vehicleId: JEEP,
      problemId: draft.id,
      actionId: "swap-coil-plug",
      rationale: "fixed",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    // No misfire evidence → recognition empty → verify passes.
    const verified = await ctx.actions.verifyDiagnosticProblem({ problemId: draft.id });
    expect(verified.status).toBe("solved");
    expect(verified.verification?.result).toBe("passed");
  });

  it("verify fails and reopens when the triggering class is still proven", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await ctx.actions.logRepair({
      vehicleId: JEEP,
      problemId: draft.id,
      actionId: "swap-coil-plug",
      rationale: "thought fixed",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await ctx.store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 90, timestamp: "2026-01-01T00:00:00Z" }],
    });
    const verified = await ctx.actions.verifyDiagnosticProblem({ problemId: draft.id });
    expect(verified.status).toBe("open");
    expect(verified.verification?.result).toBe("failed");
    expect(verified.verification?.stillProven).toContain("MisfireUnderLoad");
  });

  it("abandon / escalate / reopen lifecycle", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const escalated = await ctx.actions.escalateDiagnosticProblem({ problemId: draft.id });
    expect(escalated.status).toBe("escalated");

    const reopened = await ctx.actions.reopenDiagnosticProblem({ problemId: draft.id });
    expect(reopened.status).toBe("open");
    expect(reopened.reopenedFromId).toBe(draft.id);

    const abandoned = await ctx.actions.abandonDiagnosticProblem({ problemId: draft.id });
    expect(abandoned.status).toBe("abandoned");

    const again = await ctx.actions.reopenDiagnosticProblem({ problemId: draft.id });
    expect(again.status).toBe("open");
  });

  it("reopen clears prior verification state", async () => {
    const draft = await ctx.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await ctx.actions.logRepair({
      vehicleId: JEEP,
      problemId: draft.id,
      actionId: "swap-coil-plug",
      rationale: "fixed",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await ctx.actions.verifyDiagnosticProblem({ problemId: draft.id });
    const reopened = await ctx.actions.reopenDiagnosticProblem({ problemId: draft.id });
    expect(reopened.status).toBe("open");
    expect(reopened.verification).toBeUndefined();
  });
});
