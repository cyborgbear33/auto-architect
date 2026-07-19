import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import misfireReasonFixture from "../../ontology/fixtures/misfire_reason_fixture.json" with {
  type: "json",
};
import { createLogosBridge } from "./index.ts";
import type { ReasonInput } from "./types.ts";

/**
 * Exercises the REAL `python3 -m logos reason --json` subprocess (no fake)
 * against the same misfire safety-hold fixture `docs/ai/ONTOLOGY_DEV_GUIDE.md`
 * tells contributors to run by hand — covers ABox-realization-driven rule
 * firing (the exact shape `PolicyService` depends on for safety holds).
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

interface FixtureEntry {
  id: string;
  kind: "Ontology" | "Rule" | "Claim";
  [key: string]: unknown;
}

/** The fixture is already the flat `[ontology, ...rules, ...facts]` array `reason` reads. */
function reasonInputFromFixture(fixture: FixtureEntry[]): ReasonInput {
  const ontologyEntry = fixture.find((e) => e.kind === "Ontology");
  if (!ontologyEntry) throw new Error("fixture missing an Ontology entry");
  const { id: _id, kind: _kind, ...ontology } = ontologyEntry;
  const rules = fixture
    .filter((e) => e.kind === "Rule")
    .map((r) => ({
      id: r.id,
      if: r.if as string,
      then: r.then as string,
      priority: r.priority as number | undefined,
      defeatIf: r.defeat_if as string | undefined,
    }));
  const facts = fixture
    .filter((e) => e.kind === "Claim")
    .map((c) => ({
      id: c.id,
      formula: c.formula as string,
      confidence: c.confidence as number | undefined,
    }));
  return { ontology, rules, facts };
}

describe.skipIf(!available)("LOGOS reason real subprocess integration", () => {
  it("realizes MisfireUnderLoad from role edges and fires the stop-driving safety rule", async () => {
    const bridge = createLogosBridge();
    const res = await bridge.reason(
      reasonInputFromFixture(misfireReasonFixture as unknown as FixtureEntry[]),
    );

    // No fact asserts MisfireUnderLoad directly — realization must derive it
    // from hasDtc/hasCondition role edges before the rule can fire on it.
    expect(
      res.realized.some(
        (r) => r.individual === "jeep_renegade_engine" && r.class === "MisfireUnderLoad",
      ),
    ).toBe(true);
    expect(
      res.derived.some(
        (d) => d.formula === "Ought(StopDrivingAndDiagnose(owner, jeep_renegade_engine))",
      ),
    ).toBe(true);
    expect(res.fixpoint).toBe(true);
  });
});

describe("LOGOS reason integration availability", () => {
  it(
    available
      ? "LOGOS is installed — reason integration ran"
      : "LOGOS not installed — reason integration skipped",
    () => {
      expect(typeof available).toBe("boolean");
    },
  );
});
