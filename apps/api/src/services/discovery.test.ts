import type { ObdCapabilityReport } from "@auto/semantic-types";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { DiscoveryService } from "./discovery.ts";
import { VehicleService } from "./vehicle.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";
const TRUCK = "veh:silverado-2500hd-2003";

function sampleReport(
  vehicleId: string,
  overrides: Partial<ObdCapabilityReport> = {},
): ObdCapabilityReport {
  return {
    vehicleId,
    capturedAt: "2026-07-20T12:00:00.000Z",
    source: "obd_gateway",
    connection: {
      connected: true,
      port: "/dev/rfcomm0",
      protocolId: "6",
      protocolName: "ISO 15765-4 (CAN 11/500)",
    },
    modes: {
      mode01: {
        supported: ["RPM", "ENGINE_LOAD", "COOLANT_TEMP"],
        unsupported: ["FUEL_RATE"],
        unknown: [],
      },
      mode02FreezeFrame: { supported: true },
      mode03Dtcs: { supported: true },
      mode07Pending: { supported: false },
      mode06: {
        supportedMids: ["21"],
        unsupportedMids: [],
        unknownMids: ["01"],
      },
      vin: { supported: true },
    },
    manualOnlyPids: ["OIL_PRESSURE_PSI", "OIL_LEVEL_PCT"],
    ...overrides,
  };
}

describe("DiscoveryService", () => {
  const store = createMemoryStore();
  const vehicles = new VehicleService(store);
  const discovery = new DiscoveryService(store, vehicles);

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("enriches Mode 01/06 with ontology and Jeep gray-adapter hardware note", async () => {
    await discovery.record(sampleReport(JEEP));
    const forensics = await discovery.getForensics(JEEP);
    expect(forensics).not.toBeNull();
    expect(forensics!.hardware.preferredAdapter).toBe("OBDLink MX+");
    expect(forensics!.hardware.adapterNotes.some((n) => /gray/i.test(n))).toBe(true);

    const rpm = forensics!.mode01.find((r) => r.pid === "RPM");
    expect(rpm).toMatchObject({
      support: "supported",
      inOntology: true,
      inDefaultPoll: true,
      unit: "rpm",
    });

    const mid21 = forensics!.mode06.find((r) => r.mid === "21");
    expect(mid21?.inOntology).toBe(true);
    expect(mid21?.support).toBe("supported");

    expect(forensics!.summary.mode01Supported).toBe(3);
    expect(forensics!.markdown).toContain("Vehicle intelligence");
    expect(forensics!.html).toContain("<h1>");
  });

  it("does not claim a gray adapter for the Silverado", async () => {
    await discovery.record(sampleReport(TRUCK));
    const forensics = await discovery.getForensics(TRUCK);
    expect(forensics).not.toBeNull();
    expect(forensics!.hardware.adapterNotes.some((n) => /gray/i.test(n))).toBe(false);
    expect(forensics!.hardware.preferredAdapter).toBe("OBDLink MX+");
  });

  it("keeps a short history and returns latest forensics", async () => {
    await discovery.record(sampleReport(JEEP, { capturedAt: "2026-07-20T10:00:00.000Z" }));
    await discovery.record(
      sampleReport(JEEP, {
        capturedAt: "2026-07-20T11:00:00.000Z",
        modes: {
          ...sampleReport(JEEP).modes,
          mode01: { supported: ["RPM"], unsupported: [], unknown: [] },
        },
      }),
    );
    const latest = await store.discovery.latest(JEEP);
    expect(latest?.capturedAt).toBe("2026-07-20T11:00:00.000Z");
    expect(latest?.modes.mode01.supported).toEqual(["RPM"]);
    const list = await store.discovery.list(JEEP);
    expect(list).toHaveLength(2);
  });

  it("returns null forensics when nothing recorded", async () => {
    expect(await discovery.getForensics(JEEP)).toBeNull();
  });
});
