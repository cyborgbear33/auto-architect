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
      member: hasMisfire ? ["Engine", "MisfireUnderLoad"] : ["Engine"],
      mostSpecific: hasMisfire ? ["MisfireUnderLoad"] : [],
      undecided: [],
    };
  });
}

describe("CascadePrognosisService F6/F7", () => {
  const store = createMemoryStore();
  let services: ReturnType<typeof createServices>;

  beforeEach(async () => {
    await store.reset();
    await seed(store);
    services = createServices(store, bridgeWithMisfire());
  });

  it("returns an honest empty watchlist with no matching antecedents", async () => {
    const result = await services.cascadePrognosis.forVehicle(JEEP);
    expect(result.items).toEqual([]);
    expect(result.emptyReason).toMatch(/No curated cascade/);
  });

  it("elevates catalyst watch when MisfireUnderLoad is proven", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: "2026-07-19T12:00:00.000Z",
      source: "simulated",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 85, timestamp: "2026-07-19T12:00:00.000Z" }],
    });
    const result = await services.cascadePrognosis.forVehicle(JEEP);
    const cat = result.items.find((i) => i.consequentClass === "CatalystEfficiencyBank1");
    expect(cat).toBeTruthy();
    expect(cat?.band).toBe("Elevated");
    expect(cat?.matchedAntecedent).toEqual({ kind: "provenClass", id: "MisfireUnderLoad" });
    expect(cat?.evidence.some((e) => /MisfireUnderLoad/.test(e))).toBe(true);
  });

  it("does not list MultiAir oil-starvation cascade on a non-Tigershark family", async () => {
    // Silverado is seeded; prove ChronicOilConsumption-shaped recognition via custom bridge
    // would still be gated by engineFamilies on the edge — Jeep-only edge must not fire here.
    const silverado = "veh:silverado-2500hd-2003";
    const result = await services.cascadePrognosis.forVehicle(silverado);
    expect(result.items.every((i) => i.consequentClass !== "MultiAirOilStarvation")).toBe(true);
  });

  it("elevates rotor scoring when operator marks BrakePadThin (F8)", async () => {
    await services.vehicles.setManualConditions(JEEP, {
      conditions: [{ id: "BrakePadThin" }],
    });
    const result = await services.cascadePrognosis.forVehicle(JEEP);
    const rotor = result.items.find((i) => i.consequentClass === "RotorScoringRisk");
    expect(rotor).toBeTruthy();
    expect(rotor?.band).toBe("Elevated");
    expect(rotor?.matchedAntecedent).toEqual({
      kind: "manualCondition",
      id: "BrakePadThin",
    });
    expect(rotor?.evidence.some((e) => /BrakePadThin/.test(e))).toBe(true);
  });

  it("rejects unknown manual condition ids", async () => {
    await expect(
      services.vehicles.setManualConditions(JEEP, {
        conditions: [{ id: "NotARealCondition" }],
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/Unknown manual condition/) });
  });

  it("elevates hub failure when operator marks HubBearingGrowl (F8 deepen)", async () => {
    await services.vehicles.setManualConditions(JEEP, {
      conditions: [{ id: "HubBearingGrowl" }],
    });
    const result = await services.cascadePrognosis.forVehicle(JEEP);
    const hub = result.items.find((i) => i.consequentClass === "WheelHubFailureRisk");
    expect(hub).toBeTruthy();
    expect(hub?.band).toBe("High");
    expect(hub?.matchedAntecedent).toEqual({
      kind: "manualCondition",
      id: "HubBearingGrowl",
    });
  });
});
