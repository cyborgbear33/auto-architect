import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import misfireRealizeFixture from "../../ontology/fixtures/misfire_realize_fixture.json" with {
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
function realizeInputFromFixture(fixture: typeof misfireRealizeFixture): RealizeInput {
  const { abox, individual, classify, ...ontology } = fixture;
  return { ontology, abox: abox as unknown as RealizeInput["abox"], individual, classify };
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
