import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("SolutionHistoryService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("aggregates outcomes by action and fault class for the vehicle", async () => {
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
      rationale: "first try",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-coil-4",
      rationale: "repeat success",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-injector-4",
      rationale: "wrong guess",
      decidedBy: "owner",
      outcomeStatus: "failed",
    });

    const history = await services.solutionHistory.forVehicle(JEEP);
    expect(history.engineFamily).toBe("fca-tigershark-2.4");
    expect(history.vehicle[0]?.actionId).toBe("swap-coil-4");
    expect(history.vehicle[0]?.faultClass).toBe("MisfireUnderLoad");
    expect(history.vehicle[0]?.worked).toBe(2);
    expect(history.vehicle.find((b) => b.actionId === "swap-injector-4")?.failed).toBe(1);
    expect(history.engineFamilyRollup.some((b) => b.actionId === "swap-coil-4")).toBe(true);
  });

  it("filters by fault class when requested", async () => {
    const misfire = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const oil = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MultiAirOilStarvation",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: misfire.id,
      actionId: "swap-coil-4",
      rationale: "ok",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: oil.id,
      actionId: "change-oil",
      rationale: "ok",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });

    const filtered = await services.solutionHistory.forVehicle(JEEP, "MisfireUnderLoad");
    expect(filtered.faultClassFilter).toBe("MisfireUnderLoad");
    expect(filtered.vehicle).toHaveLength(1);
    expect(filtered.vehicle[0]?.actionId).toBe("swap-coil-4");
  });
});
