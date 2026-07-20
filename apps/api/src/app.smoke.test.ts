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
});
