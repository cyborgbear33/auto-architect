import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("CaseTimelineService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("builds open → repair → verify → closed_solved for a case", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-coil-4",
      rationale: "coil followed misfire",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.verifyDiagnosticProblem({ problemId: problem.id });

    const timeline = await services.caseTimeline.forVehicle(JEEP, problem.id);
    expect(timeline.problemIdFilter).toBe(problem.id);
    const types = timeline.events.map((e) => e.type);
    expect(types).toEqual([
      "opened",
      "repair_logged",
      "verify_started",
      "verify_result",
      "closed_solved",
    ]);
    expect(timeline.events.find((e) => e.type === "repair_logged")?.actionId).toBe("swap-coil-4");
    expect(timeline.events.find((e) => e.type === "verify_result")?.verifyResult).toBe("passed");
  });

  it("includes abandon / reopen lifecycle events", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.abandonDiagnosticProblem({ problemId: problem.id });
    let timeline = await services.caseTimeline.forVehicle(JEEP, problem.id);
    expect(timeline.events.map((e) => e.type)).toEqual(["opened", "abandoned"]);

    await services.actions.reopenDiagnosticProblem({ problemId: problem.id });
    timeline = await services.caseTimeline.forVehicle(JEEP, problem.id);
    expect(timeline.events.map((e) => e.type)).toEqual(["opened", "reopened"]);
    expect(timeline.events.find((e) => e.type === "reopened")?.reopenedFromId).toBe(problem.id);
  });

  it("returns vehicle-wide events and filters by problemId", async () => {
    const a = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const b = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MultiAirOilStarvation",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });

    const all = await services.caseTimeline.forVehicle(JEEP);
    expect(all.events.filter((e) => e.type === "opened")).toHaveLength(2);

    const onlyA = await services.caseTimeline.forVehicle(JEEP, a.id);
    expect(onlyA.events.every((e) => e.problemId === a.id)).toBe(true);
    expect(onlyA.events.some((e) => e.problemId === b.id)).toBe(false);
  });
});
