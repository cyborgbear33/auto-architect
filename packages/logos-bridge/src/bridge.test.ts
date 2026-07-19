import { describe, expect, it } from "vitest";
import { createLogosBridge, type ExecFn } from "./bridge.ts";
import { LogosNotAvailableError, LogosSchemaError, LogosTimeoutError } from "./errors.ts";

function fakeExec(
  handler: (args: string[], input?: string) => { stdout?: string; error?: Record<string, unknown> },
): ExecFn {
  return async (_bin, args, opts) => {
    const { stdout, error } = handler(args, opts.input);
    if (error) {
      throw Object.assign(new Error("Command failed"), error, { stdout: error.stdout ?? "" });
    }
    return { stdout: stdout ?? "", stderr: "" };
  };
}

describe("createLogosBridge (subprocess transport)", () => {
  it("round-trips solve --json through toWireProblem/solutionFromWire", async () => {
    let sentPayload: unknown;
    const exec = fakeExec((args, input) => {
      expect(args).toEqual(["-m", "logos", "solve", "-", "--json"]);
      sentPayload = JSON.parse(input!);
      return {
        stdout: JSON.stringify({
          problem_id: "PRB_problem:1",
          types: ["Diagnostic"],
          pattern: "p",
          ranked: [],
          disqualified: [],
          recommended: null,
          kind: "act",
          rationale: "r",
          confidence: null,
          certainty: "n/a",
          anti_patterns: [],
          escalations: [],
        }),
      };
    });
    const bridge = createLogosBridge({ exec });
    const result = await bridge.solve({
      id: "problem:1",
      statement: { currentState: "a", desiredState: "b", gap: "c" },
    });
    expect(result.problemId).toBe("problem:1");
    expect((sentPayload as { id: string }).id).toBe("PRB_problem:1");
  });

  it("maps ENOENT spawn failures to LogosNotAvailableError", async () => {
    const exec = fakeExec(() => ({ error: { code: "ENOENT" } }));
    const bridge = createLogosBridge({ exec });
    await expect(
      bridge.solve({
        id: "problem:1",
        statement: { currentState: "a", desiredState: "b", gap: "c" },
      }),
    ).rejects.toBeInstanceOf(LogosNotAvailableError);
  });

  it("maps a SIGTERM timeout kill to LogosTimeoutError", async () => {
    const exec = fakeExec(() => ({ error: { killed: true, signal: "SIGTERM" } }));
    const bridge = createLogosBridge({ exec });
    await expect(
      bridge.solve({
        id: "problem:1",
        statement: { currentState: "a", desiredState: "b", gap: "c" },
      }),
    ).rejects.toBeInstanceOf(LogosTimeoutError);
  });

  it("surfaces schema_validation_failed as LogosSchemaError with shapeErrors", async () => {
    const exec = fakeExec(() => ({
      error: {
        code: 2,
        stdout: JSON.stringify({
          error: "schema_validation_failed",
          schema: "Problem",
          shape_errors: ["id: required"],
        }),
      },
    }));
    const bridge = createLogosBridge({ exec });
    try {
      await bridge.solve({
        id: "problem:1",
        statement: { currentState: "a", desiredState: "b", gap: "c" },
      });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LogosSchemaError);
      expect((err as LogosSchemaError).shapeErrors).toEqual(["id: required"]);
    }
  });

  it("realize sends the flat ontology+abox payload and parses member/mostSpecific", async () => {
    const exec = fakeExec((args, input) => {
      expect(args).toEqual(["-m", "logos", "realize", "-", "--json"]);
      const payload = JSON.parse(input!);
      expect(payload.individual).toBe("veh:x");
      return {
        stdout: JSON.stringify({
          individual: "veh:x",
          member: ["Engine"],
          most_specific: ["Engine"],
          undecided: [],
        }),
      };
    });
    const bridge = createLogosBridge({ exec });
    const result = await bridge.realize({
      ontology: { subtypes: {} },
      abox: { concepts: {}, roles: [] },
      individual: "veh:x",
    });
    expect(result.member).toEqual(["Engine"]);
    expect(result.mostSpecific).toEqual(["Engine"]);
  });
});
