import type { ObservationBatch } from "@auto/semantic-types";
import { describe, expect, it } from "vitest";
import { replaceVehicleBatches } from "./drizzle.ts";

const kept: ObservationBatch = {
  vehicleId: "veh:1",
  capturedAt: "2026-07-19T12:00:00.000Z",
  source: "simulated",
};

const later: ObservationBatch = {
  ...kept,
  capturedAt: "2026-07-19T13:00:00.000Z",
};

/**
 * A stand-in for the database transaction: the log changes only if every
 * step finishes. A throw restores the log from before the rewrite.
 */
function transactionalLog(initial: string[]) {
  const log = [...initial];
  return {
    log,
    transaction: async (work: (tx: { log: string[] }) => Promise<void>) => {
      const snapshot = [...log];
      const draft = [...log];
      try {
        await work({ log: draft });
        log.splice(0, log.length, ...draft);
      } catch (err) {
        log.splice(0, log.length, ...snapshot);
        throw err;
      }
    },
  };
}

describe("replaceVehicleBatches", () => {
  it("writes the kept batches in time order and drops the previous log", async () => {
    const store = transactionalLog(["2026-07-19T10:00:00.000Z", "2026-07-19T11:00:00.000Z"]);
    await replaceVehicleBatches(
      store.transaction,
      async (tx) => {
        tx.log.length = 0;
      },
      async (tx, batch) => {
        tx.log.push(batch.capturedAt);
      },
      "veh:1",
      [later, kept],
    );
    expect(store.log).toEqual([kept.capturedAt, later.capturedAt]);
  });

  it("restores the previous log when an insert fails after the delete", async () => {
    const store = transactionalLog(["2026-07-19T10:00:00.000Z"]);
    await expect(
      replaceVehicleBatches(
        store.transaction,
        async (tx) => {
          tx.log.length = 0;
        },
        async (tx, batch) => {
          if (batch.capturedAt === later.capturedAt) throw new Error("insert failed");
          tx.log.push(batch.capturedAt);
        },
        "veh:1",
        [kept, later],
      ),
    ).rejects.toThrow("insert failed");
    expect(store.log).toEqual(["2026-07-19T10:00:00.000Z"]);
  });
});
