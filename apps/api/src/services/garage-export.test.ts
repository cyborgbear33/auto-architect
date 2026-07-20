import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("GarageExportService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("dumps a vehicle as auto-architect.garage v1 JSON", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 80, unit: "%", timestamp: "2026-01-01T00:00:00Z" }],
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
      rationale: "test",
      decidedBy: "owner",
      outcomeStatus: "worked",
    });

    const dump = await services.garageExport.dumpVehicle(JEEP);
    expect(dump.format).toBe("auto-architect.garage");
    expect(dump.version).toBe(1);
    expect(dump.scope).toBe("vehicle");
    expect(dump.vehicleId).toBe(JEEP);
    expect(dump.vehicles).toHaveLength(1);
    expect(dump.observations).toHaveLength(1);
    expect(dump.problems).toHaveLength(1);
    expect(dump.decisions).toHaveLength(1);
  });

  it("exports CSV tables with headers and quoting", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      dtcs: [{ code: "P0304", status: "stored", description: 'coil, "A" bank' }],
      pids: [{ pid: "ENGINE_LOAD", value: 80, timestamp: "2026-01-01T00:00:00Z" }],
    });
    const obs = await services.garageExport.observationsCsv(JEEP);
    expect(obs.split("\n")[0]).toContain("vehicleId,capturedAt,source,pid");
    expect(obs).toContain("ENGINE_LOAD");

    const dtcs = await services.garageExport.dtcsCsv(JEEP);
    expect(dtcs).toContain("P0304");
    expect(dtcs).toContain('"coil, ""A"" bank"');
  });

  it("round-trips dump → import with observation dedupe", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-01-01T00:00:00Z",
      source: "manual_entry",
      pids: [{ pid: "RPM", value: 800, timestamp: "2026-01-01T00:00:00Z" }],
    });
    const problem = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });

    const dump = await services.garageExport.dumpGarage();
    const first = await services.garageExport.importDump(dump);
    expect(first.observationsSkipped).toBeGreaterThanOrEqual(1);
    expect(first.problemsUpserted).toBeGreaterThanOrEqual(1);

    await store.reset();
    await seed(store);
    const fresh = await services.garageExport.importDump(dump);
    expect(fresh.vehiclesUpserted).toBeGreaterThanOrEqual(1);
    expect(fresh.observationsAppended).toBe(dump.observations.length);
    expect(fresh.problemsUpserted).toBe(dump.problems.length);

    const batches = await store.observations.listBatches(JEEP);
    expect(batches.some((b) => b.pids?.some((p) => p.pid === "RPM"))).toBe(true);
    expect(await store.problems.get(problem.id)).toBeTruthy();
  });
});
