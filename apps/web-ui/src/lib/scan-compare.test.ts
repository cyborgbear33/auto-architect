import type { ObservationBatch } from "@auto/semantic-types";
import { describe, expect, it } from "vitest";
import { clampScanPair, compareScans } from "./scan-compare.ts";

function batch(overrides: Partial<ObservationBatch> = {}): ObservationBatch {
  return {
    vehicleId: "veh:1",
    capturedAt: "2026-07-19T10:00:00.000Z",
    source: "simulated",
    ...overrides,
  };
}

describe("compareScans", () => {
  it("does not compare samples inside a single drive session", () => {
    const result = compareScans([
      batch({
        sessionId: "session:watch",
        capturedAt: "2026-07-19T10:00:00.000Z",
        dtcs: [{ code: "P0304", status: "stored" }],
      }),
      batch({
        sessionId: "session:watch",
        capturedAt: "2026-07-19T10:05:00.000Z",
        dtcs: [],
      }),
    ]);
    expect(result).toBeNull();
  });

  it("compares the last sample of the earlier session with the last sample of the later one", () => {
    const result = compareScans([
      batch({
        sessionId: "session:before",
        capturedAt: "2026-07-19T10:00:00.000Z",
        dtcs: [{ code: "p0304", status: "pending" }],
        pids: [{ pid: "ENGINE_LOAD", value: 40, unit: "%", timestamp: "2026-07-19T10:00:00.000Z" }],
      }),
      batch({
        sessionId: "session:before",
        capturedAt: "2026-07-19T10:10:00.000Z",
        dtcs: [{ code: "P0304", status: "stored" }],
        pids: [{ pid: "ENGINE_LOAD", value: 80, unit: "%", timestamp: "2026-07-19T10:10:00.000Z" }],
      }),
      batch({
        sessionId: "session:after",
        capturedAt: "2026-07-19T12:00:00.000Z",
        dtcs: [{ code: "P0171", status: "stored" }],
        pids: [
          { pid: "ENGINE_LOAD", value: 80, unit: "%", timestamp: "2026-07-19T12:00:00.000Z" },
          { pid: "RPM", value: 900, unit: "rpm", timestamp: "2026-07-19T12:00:00.000Z" },
        ],
      }),
    ]);
    expect(result?.earlier.capturedAt).toBe("2026-07-19T10:10:00.000Z");
    expect(result?.later.capturedAt).toBe("2026-07-19T12:00:00.000Z");
    expect(result?.codes).toEqual([
      { code: "P0171", kind: "only-later", laterStatus: "stored" },
      { code: "P0304", kind: "only-earlier", earlierStatus: "stored" },
    ]);
    expect(result?.readings).toEqual([{ pid: "RPM", kind: "only-later", later: 900, unit: "rpm" }]);
  });

  it("keeps a code that stayed and notes a status change", () => {
    const result = compareScans([
      batch({
        capturedAt: "2026-07-19T10:00:00.000Z",
        dtcs: [
          { code: "P0304", status: "pending" },
          { code: "P0420", status: "stored" },
        ],
      }),
      batch({
        capturedAt: "2026-07-19T12:00:00.000Z",
        dtcs: [
          { code: "P0304", status: "stored" },
          { code: "P0420", status: "stored" },
        ],
      }),
    ]);
    expect(result?.codes).toEqual([
      { code: "P0304", kind: "status", earlierStatus: "pending", laterStatus: "stored" },
      { code: "P0420", kind: "still", earlierStatus: "stored", laterStatus: "stored" },
    ]);
  });
});

describe("clampScanPair", () => {
  it("defaults to the first and last snapshot and refuses a reversed pair", () => {
    expect(clampScanPair(1, 0, 0)).toBeNull();
    expect(clampScanPair(3, 0, 2)).toEqual({ earlier: 0, later: 2 });
    expect(clampScanPair(3, 2, 0)).toEqual({ earlier: 1, later: 2 });
    expect(clampScanPair(4, 2, 2)).toEqual({ earlier: 2, later: 3 });
  });
});
