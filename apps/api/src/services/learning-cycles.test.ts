import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("LearningCycleService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("skips open problems with only an opened stamp", async () => {
    await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const list = await services.learningCycles.forVehicle(JEEP);
    expect(list.cycles).toHaveLength(0);
  });

  it("composes a cycle after solve + repair + verify", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.solveDiagnosticProblem(problem.id);
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-coil-4",
      rationale: "coil followed misfire",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.verifyDiagnosticProblem({ problemId: problem.id });

    const list = await services.learningCycles.forVehicle(JEEP, problem.id);
    expect(list.cycles).toHaveLength(1);
    const cycle = list.cycles[0]!;
    expect(cycle.id).toBe(problem.id);
    expect(cycle.faultClass).toBe("MisfireUnderLoad");
    expect(cycle.status).toBe("solved");
    expect(cycle.rankedAt).toBeTruthy();
    expect(cycle.repairedAt).toBeTruthy();
    expect(cycle.verifiedAt).toBeTruthy();
    expect(cycle.decisionIds.length).toBeGreaterThan(0);
    expect(cycle.outcome?.status).toBe("worked");
    expect(cycle.priorDelta).toBeTruthy();
    expect(cycle.priorDelta?.scope).toBeDefined();
  });
});
