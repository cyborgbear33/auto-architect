import { FakeLogosBridge } from "@auto/logos-bridge";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { createServices } from "./services/index.ts";
import { createMemoryStore } from "./store/index.ts";
import { seed } from "./store/seed.ts";

/**
 * Thin HTTP smoke: proves route registration + seed wiring without a real
 * LOGOS process. Required when changing `buildApp` / `routes/index.ts`.
 * Not a substitute for service unit tests or logos-bridge integration tests.
 */
describe("API HTTP smoke (buildApp + inject)", () => {
  const store = createMemoryStore();
  const bridge = new FakeLogosBridge();
  const services = createServices(store, bridge);
  let app: FastifyInstance;

  beforeAll(async () => {
    await seed(store);
    app = await buildApp(services);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", storage: "memory" });
  });

  it("GET /api/vehicles lists the seeded Jeep", async () => {
    const res = await app.inject({ method: "GET", url: "/api/vehicles" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { vehicles: Array<{ id: string }> };
    expect(body.vehicles.map((v) => v.id)).toContain("veh:jeep-renegade-2015-latitude");
  });

  it("GET evidence-provenance and solution-history for the seeded Jeep", async () => {
    const id = "veh:jeep-renegade-2015-latitude";
    const provenance = await app.inject({
      method: "GET",
      url: `/api/vehicles/${id}/evidence-provenance`,
    });
    expect(provenance.statusCode).toBe(200);
    expect(provenance.json()).toMatchObject({ batchCount: 0, latestSource: null });

    const readiness = await app.inject({
      method: "GET",
      url: `/api/vehicles/${id}/readiness`,
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      vehicleId: id,
      available: false,
      status: "unsupported",
      requiredPid: "STATUS",
    });

    const history = await app.inject({
      method: "GET",
      url: `/api/vehicles/${id}/solution-history`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      vehicleId: id,
      engineFamily: "fca-tigershark-2.4",
      vehicle: [],
      engineFamilyRollup: [],
    });

    const timeline = await app.inject({
      method: "GET",
      url: `/api/vehicles/${id}/case-timeline`,
    });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json()).toMatchObject({
      vehicleId: id,
      problemIdFilter: null,
      events: [],
    });

    const garage = await app.inject({ method: "GET", url: "/api/garage/export" });
    expect(garage.statusCode).toBe(200);
    expect(garage.json()).toMatchObject({
      format: "auto-architect.garage",
      version: 1,
      scope: "garage",
    });

    const csv = await app.inject({
      method: "GET",
      url: `/api/vehicles/${id}/export/decisions.csv`,
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.body).toContain("vehicleId");
  });

  it("lists Proxi special procedure and records start/complete decisions", async () => {
    const id = "veh:jeep-renegade-2015-latitude";
    const list = await app.inject({ method: "GET", url: `/api/vehicles/${id}/special-procedures` });
    expect(list.statusCode).toBe(200);
    const procedures = (list.json() as { procedures: Array<{ id: string }> }).procedures;
    expect(procedures.map((p) => p.id)).toContain("proc:fca-proxi-alignment");

    const started = await app.inject({
      method: "POST",
      url: "/api/actions/start-special-procedure",
      payload: { vehicleId: id, procedureId: "proc:fca-proxi-alignment", decidedBy: "test" },
    });
    expect(started.statusCode).toBe(201);
    const startBody = started.json() as { problem: { id: string }; procedureId: string };
    expect(startBody.procedureId).toBe("proc:fca-proxi-alignment");

    const completed = await app.inject({
      method: "POST",
      url: "/api/actions/complete-special-procedure",
      payload: {
        vehicleId: id,
        problemId: startBody.problem.id,
        procedureId: "proc:fca-proxi-alignment",
        status: "completed",
        decidedBy: "test",
      },
    });
    expect(completed.statusCode).toBe(200);
    expect((completed.json() as { problem: { status: string } }).problem.status).toBe("solved");
  });
});
