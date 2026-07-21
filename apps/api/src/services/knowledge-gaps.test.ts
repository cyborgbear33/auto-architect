import { FakeLogosBridge } from "@auto/logos-bridge";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../store/index.ts";
import { seed } from "../store/seed.ts";
import { createServices } from "./index.ts";

const JEEP = "veh:jeep-renegade-2015-latitude";

describe("KnowledgeGapService", () => {
  const store = createMemoryStore();
  const services = createServices(store, new FakeLogosBridge());

  beforeEach(async () => {
    await store.reset();
    await seed(store);
  });

  it("detects unrecognized DTCs and accepts via ActionService", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: new Date().toISOString(),
      source: "simulated",
      dtcs: [{ code: "P9999", status: "stored" }],
      pids: [],
    });

    const proposals = await services.knowledgeGaps.refresh(JEEP);
    const unknown = proposals.find((p) => p.kind === "unrecognized_dtc");
    expect(unknown).toBeTruthy();
    expect(unknown?.evidence.dtcCodes).toContain("P9999");
    expect(unknown?.status).toBe("new");

    const accepted = await services.actions.markKnowledgeGapStatus(unknown!.id, "accepted");
    expect(accepted.status).toBe("accepted");
    const decisions = await services.actions.listDecisions(JEEP);
    expect(decisions.some((d) => d.actionId === "knowledge-gap-accepted")).toBe(true);

    const exported = await services.knowledgeGaps.exportBundle(JEEP);
    expect(exported.markdown).toContain("P9999");
    expect(exported.proposals.some((p) => p.id === accepted.id)).toBe(true);
  });

  it("does not revive dismissed proposals on refresh", async () => {
    await store.observations.record({
      vehicleId: JEEP,
      capturedAt: new Date().toISOString(),
      source: "simulated",
      dtcs: [{ code: "P9998", status: "stored" }],
      pids: [],
    });
    const first = await services.knowledgeGaps.refresh(JEEP);
    const gap = first.find((p) => p.kind === "unrecognized_dtc" && p.dedupeKey.includes("P9998"));
    expect(gap).toBeTruthy();
    await services.actions.markKnowledgeGapStatus(gap!.id, "dismissed");
    const again = await services.knowledgeGaps.refresh(JEEP);
    expect(again.find((p) => p.id === gap!.id)?.status).toBe("dismissed");
    expect(again.filter((p) => p.dedupeKey === gap!.dedupeKey)).toHaveLength(1);
  });
});
