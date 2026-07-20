import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { DiscoveryService } from "./discovery.ts";
import { MasteryGuideService } from "./mastery-guide.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";
const TRUCK = "veh:silverado-2500hd-2003";

describe("MasteryGuideService", () => {
  const store = createMemoryStore();
  const vehicles = new VehicleService(store);
  const discovery = new DiscoveryService(store, vehicles);
  const guide = new MasteryGuideService(vehicles, discovery);

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("personalizes Jeep guide with gray-adapter context and Proxi procedures", async () => {
    const doc = await guide.forVehicle(JEEP);
    expect(doc.vehicleId).toBe(JEEP);
    expect(doc.title).toMatch(/Jeep Renegade/);
    expect(doc.markdown).toContain(JEEP);
    expect(doc.markdown).toMatch(/gray/i);
    expect(doc.markdown).toMatch(/Proxi/i);
    expect(doc.sections.some((s) => /discover/i.test(s.title))).toBe(true);
    expect(doc.sections.some((s) => /troubleshoot/i.test(s.title))).toBe(true);
    expect(doc.html).toContain("<h1>");
    expect(doc.html).toContain("Save as PDF");
  });

  it("does not claim Jeep gray adapter for the Silverado", async () => {
    const doc = await guide.forVehicle(TRUCK);
    expect(doc.markdown).toMatch(/Silverado/);
    expect(doc.markdown).not.toMatch(/gray-type OBD-II adapter between DLC/);
    expect(doc.markdown).toMatch(/auto-detect|J1850/i);
  });

  it("surfaces missing discovery status until a report exists", async () => {
    const before = await guide.forVehicle(JEEP);
    expect(before.markdown).toMatch(/No discovery report on file yet/i);

    await discovery.record({
      vehicleId: JEEP,
      capturedAt: "2026-07-20T15:00:00.000Z",
      source: "simulated",
      connection: {
        connected: false,
        port: null,
        protocolId: null,
        protocolName: null,
      },
      modes: {
        mode01: { supported: ["RPM"], unsupported: [], unknown: [] },
        mode02FreezeFrame: { supported: null },
        mode03Dtcs: { supported: true },
        mode07Pending: { supported: null },
        mode06: { supportedMids: [], unsupportedMids: [], unknownMids: ["21"] },
        vin: { supported: null },
      },
      manualOnlyPids: [],
    });

    const after = await guide.forVehicle(JEEP);
    expect(after.markdown).toMatch(/Mode 01: 1 supported/);
    expect(after.markdown).not.toMatch(/No discovery report on file yet/i);
  });
});
