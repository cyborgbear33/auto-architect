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

  it("preserves abandon then reopen as durable lifecycle stamps", async () => {
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
    // Durable log keeps abandoned even after status is open again.
    expect(timeline.events.map((e) => e.type)).toEqual(["opened", "abandoned", "reopened"]);
    expect(timeline.events.find((e) => e.type === "reopened")?.reopenedFromId).toBe(problem.id);

    const stored = await services.actions.getDiagnosticProblem(problem.id);
    expect(stored.lifecycleEvents?.map((e) => e.type)).toEqual([
      "opened",
      "abandoned",
      "reopened",
    ]);
  });

  it("records ranked when solve runs", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.solveDiagnosticProblem(problem.id);
    const timeline = await services.caseTimeline.forVehicle(JEEP, problem.id);
    expect(timeline.events.map((e) => e.type)).toContain("ranked");
  });

  it("stamps odometer and open session onto lifecycle + repair events (H3)", async () => {
    await store.vehicles.update(JEEP, { odometerMiles: 98_400 });
    const session = await services.driveSessions.start({
      vehicleId: JEEP,
      label: "H3 stamp drive",
      source: "simulated",
    });
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
      rationale: "with session open",
      decidedBy: "owner",
      outcomeStatus: "partial",
    });

    const timeline = await services.caseTimeline.forVehicle(JEEP, problem.id);
    const opened = timeline.events.find((e) => e.type === "opened");
    const repair = timeline.events.find((e) => e.type === "repair_logged");
    expect(opened?.odometerMiles).toBe(98_400);
    expect(opened?.sessionId).toBe(session.id);
    expect(repair?.odometerMiles).toBe(98_400);
    expect(repair?.sessionId).toBe(session.id);

    const stored = await services.actions.getDiagnosticProblem(problem.id);
    expect(stored.lifecycleEvents?.[0]?.odometerMiles).toBe(98_400);
    expect(stored.lifecycleEvents?.[0]?.sessionId).toBe(session.id);
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
