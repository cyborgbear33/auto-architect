import type { ObservationBatch } from "@auto/semantic-types";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./index.ts";

function sample(capturedAt: string, sessionId: string): ObservationBatch {
  return { vehicleId: "veh:watch", capturedAt, source: "simulated", sessionId };
}

describe("memory observation record", () => {
  it("appends a long in-order watch and keeps an equal timestamp after the earlier one", async () => {
    const store = createMemoryStore();
    await store.vehicles.create({
      id: "veh:watch",
      make: "Chevrolet",
      model: "Silverado",
      year: 2003,
      engineFamily: "gm-gen3-lq4",
    });
    const times = Array.from({ length: 200 }, (_, i) => {
      const hour = String(Math.floor(i / 60)).padStart(2, "0");
      const minute = String(i % 60).padStart(2, "0");
      return `2026-07-19T${hour}:${minute}:00.000Z`;
    });
    for (const capturedAt of times) {
      await store.observations.record(sample(capturedAt, capturedAt));
    }
    const tie = times[10] ?? "";
    await store.observations.record(sample(tie, "tie"));
    const batches = await store.observations.listBatches("veh:watch");
    const ids = batches.map((row) => row.sessionId);
    expect(ids).toHaveLength(201);
    expect(ids.slice(0, 11)).toEqual([...times.slice(0, 11)]);
    expect(ids[11]).toBe("tie");
    expect(ids.slice(12)).toEqual(times.slice(11));
  });
});
