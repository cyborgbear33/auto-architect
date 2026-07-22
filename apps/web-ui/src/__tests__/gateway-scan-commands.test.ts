import { describe, expect, it } from "vitest";
import { gatewayScanCommands } from "../components/GatewayScanCommands.tsx";

describe("gatewayScanCommands", () => {
  it("binds the selected vehicle id into dry-run and live scan commands", () => {
    const rows = gatewayScanCommands("veh:jeep-renegade-2015-latitude");
    const dry = rows.find((r) => r.id === "dry-run");
    const live = rows.find((r) => r.id === "live-scan");
    expect(dry?.command).toContain("veh:jeep-renegade-2015-latitude");
    expect(dry?.command).toContain("--simulate --dry-run");
    expect(live?.command).toContain("python -m obd_gateway --vehicle-id veh:jeep-renegade-2015-latitude scan");
    expect(live?.command).not.toContain("--simulate");
  });
});
