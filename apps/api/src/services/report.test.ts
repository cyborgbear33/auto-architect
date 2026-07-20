import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("ReportService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("composes a Markdown vehicle report without inventing fault classes", async () => {
    const report = await services.reports.forVehicle(JEEP);
    expect(report.scope).toBe("vehicle");
    expect(report.markdown).toMatch(/Diagnostic report/);
    expect(report.markdown).toMatch(/Nothing proven|Proven fault classes/);
    expect(report.markdown).not.toMatch(/\bHealthy\b/);
  });
});
