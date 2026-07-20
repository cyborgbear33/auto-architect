import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import camcrankRealizeFixture from "../../ontology/fixtures/camcrank_realize_fixture.json" with {
  type: "json",
};
import catalystRealizeFixture from "../../ontology/fixtures/catalyst_realize_fixture.json" with {
  type: "json",
};
import leanRealizeFixture from "../../ontology/fixtures/lean_realize_fixture.json" with {
  type: "json",
};
import misfireRealizeFixture from "../../ontology/fixtures/misfire_realize_fixture.json" with {
  type: "json",
};
import o2RealizeFixture from "../../ontology/fixtures/o2_realize_fixture.json" with {
  type: "json",
};
import richRealizeFixture from "../../ontology/fixtures/rich_realize_fixture.json" with {
  type: "json",
};
import { createLogosBridge } from "./index.ts";
import type { RealizeInput } from "./types.ts";

/**
 * Exercises the REAL `python3 -m logos realize --json` subprocess (no fake)
 * against the same fixture `docs/ai/ONTOLOGY_DEV_GUIDE.md` tells contributors
 * to run by hand after editing the TBox — so CI catches wire drift between
 * `@auto/logos-bridge` and the engine, not just "the CLI still runs".
 *
 * Self-skips when LOGOS isn't installed. To run it locally:
 *   pip install -e /path/to/metalanguage/engine   (or set LOGOS_PYTHON_BIN)
 */
function logosAvailable(): boolean {
  try {
    execFileSync(process.env.LOGOS_PYTHON_BIN ?? "python3", ["-m", "logos", "--help"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const available = logosAvailable();

/** The fixture is already the flat wire shape `logos realize <file> --json` reads. */
function realizeInputFromFixture(fixture: {
  abox: unknown;
  individual: string;
  classify: string[];
  [key: string]: unknown;
}): RealizeInput {
  const { abox, individual, classify, ...ontology } = fixture;
  return { ontology, abox: abox as RealizeInput["abox"], individual, classify };
}

describe.skipIf(!available)("LOGOS realize real subprocess integration", () => {
  it("proves MisfireUnderLoad and rules out MultiAirOilStarvation from the misfire fixture", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(misfireRealizeFixture));

    expect(result.individual).toBe("jeep_renegade_engine");
    expect(result.mostSpecific).toContain("MisfireUnderLoad");
    // No MultiAirFault dtc / LowOilPressure condition is asserted for this
    // individual — the tableau must NOT synthesize membership from nothing.
    expect(result.member).not.toContain("MultiAirOilStarvation");
  });

  it("proves LeanFuelBank1 from P0171 + positive fuel trim", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(leanRealizeFixture));
    expect(result.mostSpecific).toContain("LeanFuelBank1");
    expect(result.member).not.toContain("MisfireUnderLoad");
  });

  it("proves CamCrankCorrelationFault from P0016", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(camcrankRealizeFixture));
    expect(result.mostSpecific).toContain("CamCrankCorrelationFault");
    expect(result.member).not.toContain("MisfireUnderLoad");
  });

  it("proves RichFuelBank1 from P0172 + negative fuel trim", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(richRealizeFixture));
    expect(result.mostSpecific).toContain("RichFuelBank1");
    expect(result.member).not.toContain("MisfireUnderLoad");
  });

  it("proves CatalystEfficiencyBank1 from P0420", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(catalystRealizeFixture));
    expect(result.mostSpecific).toContain("CatalystEfficiencyBank1");
    expect(result.member).not.toContain("MisfireUnderLoad");
  });

  it("proves O2CircuitFaultBank1 from P0130", async () => {
    const bridge = createLogosBridge();
    const result = await bridge.realize(realizeInputFromFixture(o2RealizeFixture));
    expect(result.mostSpecific).toContain("O2CircuitFaultBank1");
    expect(result.member).not.toContain("O2HeaterFaultBank1");
    expect(result.member).not.toContain("MisfireUnderLoad");
  });
});

describe("LOGOS realize integration availability", () => {
  it(
    available
      ? "LOGOS is installed — realize integration ran"
      : "LOGOS not installed — realize integration skipped",
    () => {
      expect(typeof available).toBe("boolean");
    },
  );
});
