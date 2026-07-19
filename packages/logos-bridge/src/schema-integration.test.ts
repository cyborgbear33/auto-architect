import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createLogosBridge, LogosSchemaError, payloadFromServeReply } from "./index.ts";

/**
 * Real-engine + serve-unit coverage for LOGOS Problem/Ontology schema
 * fail-fast. The wire-failure taxonomy is domain-agnostic (ported in spirit
 * from @garden/logos-bridge's equivalent test) — this only proves auto's copy
 * of the bridge still classifies a real schema rejection the same way.
 * Self-skips when logos isn't installed.
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

describe("payloadFromServeReply schema fail-fast", () => {
  it("throws LogosSchemaError when result is schema_validation_failed (even at salvageable exit 1)", () => {
    expect(() =>
      payloadFromServeReply(
        {
          ok: false,
          exit_code: 1,
          result: {
            error: "schema_validation_failed",
            schema: "Problem",
            shape_errors: ["<root>: 'id' is a required property"],
          },
        },
        { salvageNonZero: true, command: "solve" },
      ),
    ).toThrow(LogosSchemaError);
  });

  it("throws LogosSchemaError on exit 2 schema failure in result", () => {
    try {
      payloadFromServeReply(
        {
          ok: false,
          exit_code: 2,
          result: {
            error: "schema_validation_failed",
            schema: "Ontology",
            shape_errors: ["subtypes: expected object"],
          },
        },
        { salvageNonZero: true, command: "revise" },
      );
      expect.fail("expected LogosSchemaError");
    } catch (e) {
      expect(e).toBeInstanceOf(LogosSchemaError);
      expect((e as LogosSchemaError).exitCode).toBe(2);
      expect((e as LogosSchemaError).shapeErrors).toEqual(["subtypes: expected object"]);
    }
  });
});

describe.skipIf(!available)("LOGOS schema fail-fast real subprocess", () => {
  it("rejects an invalid Problem (missing id) with LogosSchemaError", async () => {
    const bridge = createLogosBridge();
    // Bypass TS — deliberate wire-shape drift the engine schema must catch.
    const bad = {
      statement: { currentState: "a", desiredState: "b", gap: "c" },
      actions: [],
    } as unknown as Parameters<typeof bridge.solve>[0];

    const err = await bridge.solve(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LogosSchemaError);
    expect((err as LogosSchemaError).schema).toBe("Problem");
    expect((err as LogosSchemaError).shapeErrors.length).toBeGreaterThan(0);
  });
});

describe("LOGOS schema integration availability", () => {
  it(
    available
      ? "LOGOS is installed — schema integration ran"
      : "LOGOS not installed — schema integration skipped",
    () => {
      expect(typeof available).toBe("boolean");
    },
  );
});
