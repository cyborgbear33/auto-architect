import { describe, expect, it } from "vitest";
import { detectObdLogFormat, parseElm327Text, parseObdLogV1 } from "./obd-log-import.ts";

const SAMPLE = `# auto-architect.obdlog v1
vehicle: veh:jeep-renegade-2015-latitude
source: manual_entry

2026-07-19T12:00:00.000Z DTC P0304 stored
2026-07-19T12:00:00.000Z PID RPM 2400
2026-07-19T12:00:00.000Z PID ENGINE_LOAD 72
2026-07-19T12:01:00.000Z PID RPM 900
`;

const ELM = `ATZ
ELM327 v1.5
ATE0
OK
>010C
41 0C 1A F8
>0105
41 05 64
>03
43 03 04 00 00
`;

describe("parseObdLogV1", () => {
  it("groups same-timestamp lines into one batch", () => {
    const { batches, linesParsed } = parseObdLogV1(SAMPLE, {
      vehicleId: "veh:ignored",
    });
    expect(batches).toHaveLength(2);
    expect(batches[0]?.dtcs).toEqual([{ code: "P0304", status: "stored" }]);
    expect(batches[0]?.pids).toHaveLength(2);
    expect(batches[1]?.pids?.[0]).toMatchObject({ pid: "RPM", value: 900 });
    expect(linesParsed).toBeGreaterThan(4);
  });

  it("rejects logs without the header", () => {
    expect(() =>
      parseObdLogV1("2026-07-19T12:00:00.000Z DTC P0304 stored\n", { vehicleId: "veh:x" }),
    ).toThrow(/auto-architect\.obdlog v1/);
  });
});

describe("parseElm327Text", () => {
  it("decodes Mode 01 RPM/coolant and Mode 03 DTCs", () => {
    const { batches } = parseElm327Text(ELM, { vehicleId: "veh:jeep" });
    const pids = batches.flatMap((b) => b.pids ?? []);
    const dtcs = batches.flatMap((b) => b.dtcs ?? []);
    expect(pids.some((p) => p.pid === "RPM" && p.value > 1700)).toBe(true);
    expect(pids.some((p) => p.pid === "COOLANT_TEMP" && p.value === 60)).toBe(true);
    expect(dtcs.map((d) => d.code)).toContain("P0304");
  });

  it("auto-detects elm327 vs obdlog", () => {
    expect(detectObdLogFormat(ELM)).toBe("elm327-text");
    expect(detectObdLogFormat(SAMPLE)).toBe("obdlog-v1");
  });
});
