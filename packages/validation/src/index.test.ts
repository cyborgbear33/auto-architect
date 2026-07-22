import { describe, expect, it } from "vitest";
import {
  CreateDiagnosticProblemFromClassSchema,
  CreateDiagnosticProblemSchema,
  LogRepairSchema,
  ObservationBatchSchema,
} from "./index.ts";

describe("ObservationBatchSchema", () => {
  it("accepts a well-formed obd-gateway batch", () => {
    const parsed = ObservationBatchSchema.parse({
      vehicleId: "veh:jeep-renegade-2015-latitude",
      capturedAt: "2026-01-01T00:00:00Z",
      source: "obd_gateway",
      dtcs: [{ code: "P0304", status: "stored" }],
      pids: [{ pid: "ENGINE_LOAD", value: 82, timestamp: "2026-01-01T00:00:00Z" }],
    });
    expect(parsed.dtcs?.[0]?.code).toBe("P0304");
  });

  it("rejects a malformed DTC code", () => {
    expect(() =>
      ObservationBatchSchema.parse({
        vehicleId: "veh:x",
        capturedAt: "2026-01-01T00:00:00Z",
        source: "manual_entry",
        dtcs: [{ code: "NOTADTC", status: "stored" }],
      }),
    ).toThrow();
  });
});

describe("CreateDiagnosticProblemSchema", () => {
  it("defaults actions to an empty array", () => {
    const parsed = CreateDiagnosticProblemSchema.parse({
      vehicleId: "veh:x",
      statement: { currentState: "a", desiredState: "b", gap: "c" },
    });
    expect(parsed.actions).toEqual([]);
  });

  it("accepts optional operator complaints on the from-class path", () => {
    const parsed = CreateDiagnosticProblemFromClassSchema.parse({
      vehicleId: "veh:x",
      triggeredByClass: "MisfireUnderLoad",
      operatorComplaints: ["rough idle", "stall"],
    });
    expect(parsed.operatorComplaints).toEqual(["rough idle", "stall"]);
  });

  it("rejects oversized operator complaint lists", () => {
    expect(() =>
      CreateDiagnosticProblemFromClassSchema.parse({
        vehicleId: "veh:x",
        triggeredByClass: "MisfireUnderLoad",
        operatorComplaints: Array.from({ length: 9 }, (_, i) => `symptom ${i}`),
      }),
    ).toThrow();
  });
});

describe("LogRepairSchema", () => {
  it("requires a rationale and decidedBy", () => {
    expect(() =>
      LogRepairSchema.parse({
        vehicleId: "veh:x",
        problemId: "problem:1",
        actionId: "swap-coil-plug",
      }),
    ).toThrow();
  });
});
