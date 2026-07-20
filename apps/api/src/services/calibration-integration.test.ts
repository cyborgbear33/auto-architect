import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

function bridgeWithMisfire() {
  return new FakeLogosBridge(undefined, (input) => {
    const hasMisfire = Object.values(input.abox.concepts).flat().includes("CylinderMisfire");
    return {
      individual: input.individual,
      member: hasMisfire ? ["MisfireUnderLoad"] : [],
      mostSpecific: hasMisfire ? ["MisfireUnderLoad"] : [],
      undecided: [],
    };
  });
}

describe("outcome → confidence calibration (integration)", () => {
  const store = createMemoryStore();
  let services: ReturnType<typeof createServices>;

  beforeEach(async () => {
    await store.reset();
    await seed(store);
    services = createServices(store, bridgeWithMisfire());
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-07-19T12:00:00.000Z",
      source: "simulated",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 85, timestamp: "2026-07-19T12:00:00.000Z" }],
    });
  });

  it("raises draft action confidence after repeated successful repairs", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const prior = problem.actions.find((a) => a.id === "swap-coil-plug")?.confidence ?? 0;

    for (let i = 0; i < 3; i++) {
      await services.actions.logRepair({
        vehicleId: JEEP,
        problemId: problem.id,
        actionId: "swap-coil-plug",
        rationale: `success ${i}`,
        decidedBy: "owner",
        outcomeStatus: "worked",
      });
    }

    const again = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const calibrated = again.actions.find((a) => a.id === "swap-coil-plug")?.confidence ?? 0;
    expect(calibrated).toBeGreaterThan(prior);
  });

  it("sets recommendation confidence from history on refresh", async () => {
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-coil-plug",
      rationale: "ok",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    await services.actions.logRepair({
      vehicleId: JEEP,
      problemId: problem.id,
      actionId: "swap-coil-plug",
      rationale: "ok again",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });
    // Close the case so refresh can mint a shortlist card for the class again.
    await services.actions.abandonDiagnosticProblem({ problemId: problem.id });

    const recs = await services.recommendations.refresh(JEEP);
    const misfire = recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"));
    expect(misfire?.confidence).toBeDefined();
    expect(misfire!.confidence!).toBeGreaterThan(0.5);
    expect(misfire?.reason).toMatch(/swap-coil-plug|confidence|worked/);
  });
});
