import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";
import { playbookCostRisk } from "./recommendations.ts";

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

describe("RecommendationService R2/R3", () => {
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

  it("playbookCostRisk picks the highest-confidence action", () => {
    const rich = playbookCostRisk([
      { id: "cheap", confidence: 0.4, cost: 0.1, risk: 0.05 },
      { id: "best", confidence: 0.9, cost: 0.3, risk: 0.2 },
    ]);
    expect(rich.suggestedActionId).toBe("best");
    expect(rich.cost).toBe(0.3);
    expect(rich.risk).toBe(0.2);
  });

  it("refresh stamps cost/risk from the cartridge playbook (R2)", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const misfire = recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"));
    expect(misfire).toBeTruthy();
    expect(misfire?.confidence).toBeTypeOf("number");
    expect(misfire?.cost).toBeTypeOf("number");
    expect(misfire?.risk).toBeTypeOf("number");
    expect(misfire?.suggestedActionId).toBeTruthy();
  });

  it("accept and dismiss update status; listOpen hides dismissed (R3)", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const rec = recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"));
    expect(rec).toBeTruthy();
    const accepted = await services.recommendations.markStatus(rec!.id, "accepted");
    expect(accepted.status).toBe("accepted");
    expect((await services.recommendations.listOpen(JEEP)).map((r) => r.id)).toContain(rec!.id);

    await services.recommendations.markStatus(rec!.id, "dismissed");
    expect((await services.recommendations.listOpen(JEEP)).map((r) => r.id)).not.toContain(rec!.id);
  });

  it("convertToRepair opens a case and links generatedByProblem (R3)", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const rec = recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"))!;
    const { recommendation, problem } = await services.recommendations.convertToRepair(rec.id);
    expect(recommendation.status).toBe("converted_to_repair");
    expect(recommendation.generatedByProblem).toBe(problem.id);
    expect(problem.triggeredByClass).toBe("MisfireUnderLoad");
    expect(problem.status).toBe("open");

    // Idempotent: second convert returns the same case.
    const again = await services.recommendations.convertToRepair(rec.id);
    expect(again.problem.id).toBe(problem.id);
  });

  it("convert reuses an existing active case for the same class", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const rec = recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"))!;
    const existing = await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const { problem } = await services.recommendations.convertToRepair(rec.id);
    expect(problem.id).toBe(existing.id);
  });

  it("refresh skips classes that already have an active case", async () => {
    await services.actions.createDiagnosticProblem({
      vehicleId: JEEP,
      triggeredByClass: "MisfireUnderLoad",
      statement: { currentState: "", desiredState: "", gap: "" },
      actions: [],
    });
    const recs = await services.recommendations.refresh(JEEP);
    expect(recs.find((r) => r.generatedFromClasses.includes("MisfireUnderLoad"))).toBeUndefined();
  });

  it("refresh emits campaign/TSB cards without inventing fault classes (R5)", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const campaignIds = recs.flatMap((r) => r.generatedFromCampaignIds ?? []);
    expect(campaignIds).toEqual(expect.arrayContaining(["W80", "W84", "05-047-457A"]));
    const w80 = recs.find((r) => r.generatedFromCampaignIds?.includes("W80"));
    expect(w80?.source).toBe("campaign");
    expect(w80?.generatedFromClasses).toEqual([]);
    expect(w80?.title).toMatch(/^W80:/);
    expect(w80?.reason).toMatch(/Applicability only/);
    // Class card still present when evidence proves misfire.
    expect(recs.some((r) => r.generatedFromClasses.includes("MisfireUnderLoad"))).toBe(true);
  });

  it("refresh does not duplicate open campaign cards (R5)", async () => {
    const first = await services.recommendations.refresh(JEEP);
    const second = await services.recommendations.refresh(JEEP);
    const w80Open = second.filter(
      (r) =>
        r.generatedFromCampaignIds?.includes("W80") &&
        (r.status === "new" || r.status === "viewed" || r.status === "accepted"),
    );
    expect(w80Open).toHaveLength(1);
    expect(first.filter((r) => r.generatedFromCampaignIds?.includes("W80"))).toHaveLength(1);
  });

  it("convert campaign card opens a manual case without triggeredByClass (R5)", async () => {
    const recs = await services.recommendations.refresh(JEEP);
    const w80 = recs.find((r) => r.generatedFromCampaignIds?.includes("W80"))!;
    const { recommendation, problem } = await services.recommendations.convertToRepair(w80.id);
    expect(recommendation.status).toBe("converted_to_repair");
    expect(problem.triggeredByClass).toBeUndefined();
    expect(problem.statement.currentState).toMatch(/W80/);
    expect(problem.status).toBe("open");
  });
});
