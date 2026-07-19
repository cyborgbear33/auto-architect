/**
 * Bridge-specific error classes. These stay HTTP-agnostic (no Fastify / AppError
 * dependency) — the API's SolverService catches them and maps each to the right
 * AppError/status code. Ported unchanged from @garden/logos-bridge/errors.ts —
 * the LOGOS wire-failure taxonomy is domain-agnostic.
 */

export class LogosBridgeError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "LogosBridgeError";
  }
}

/** The call exceeded its timeout and was killed. */
export class LogosTimeoutError extends LogosBridgeError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "LogosTimeoutError";
  }
}

/** LOGOS ran but failed (non-zero exit with no usable JSON on stdout). */
export class LogosSolveError extends LogosBridgeError {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message, { exitCode, stderr });
    this.name = "LogosSolveError";
  }
}

/** LOGOS produced output the bridge could not parse — signals a version skew. */
export class LogosProtocolError extends LogosBridgeError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "LogosProtocolError";
  }
}

/**
 * LOGOS rejected the wire payload against Problem/Ontology JSON Schema
 * (`error: "schema_validation_failed"`, typically exit 2). Distinguishes
 * agent/wire drift from escalate/reject data (exit 1) and solver crashes.
 */
export class LogosSchemaError extends LogosBridgeError {
  constructor(
    message: string,
    readonly schema: string,
    readonly shapeErrors: string[],
    readonly exitCode: number | null = null,
  ) {
    super(message, { schema, shapeErrors, exitCode });
    this.name = "LogosSchemaError";
  }
}

/**
 * LOGOS rejected the call as bad input / unknown command / DL parse failure
 * (`error: "invalid_input" | "unknown_command" | "dl_parse_failed"`).
 */
export class LogosInputError extends LogosBridgeError {
  constructor(
    message: string,
    readonly errorCode: string,
    readonly exitCode: number | null = null,
    details?: unknown,
  ) {
    super(message, {
      errorCode,
      exitCode,
      ...(details && typeof details === "object" ? details : {}),
    });
    this.name = "LogosInputError";
  }
}

/** python3 / the `logos` package could not be found at all. */
export class LogosNotAvailableError extends LogosBridgeError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "LogosNotAvailableError";
  }
}

/** Stable machine codes emitted by LOGOS hard failures. */
export const LOGOS_ERROR_CODES = {
  schemaValidationFailed: "schema_validation_failed",
  invalidInput: "invalid_input",
  unknownCommand: "unknown_command",
  dlParseFailed: "dl_parse_failed",
  internalError: "internal_error",
} as const;

/** Throw when LOGOS returned a schema-validation failure payload (hard-fail). */
export function throwIfSchemaValidationFailed(raw: unknown, exitCode: number | null = null): void {
  throwIfStructuredFailure(raw, exitCode);
}

/**
 * Throw when LOGOS returned a structured hard-failure payload
 * (`ok: false` + machine `error` code). Additive — older engines without
 * codes still fall through to LogosSolveError.
 */
export function throwIfStructuredFailure(raw: unknown, exitCode: number | null = null): void {
  if (typeof raw !== "object" || raw === null) return;
  const r = raw as Record<string, unknown>;
  const code = typeof r.error === "string" ? r.error : null;
  if (!code) return;

  if (code === LOGOS_ERROR_CODES.schemaValidationFailed) {
    const schema = typeof r.schema === "string" ? r.schema : "unknown";
    const shapeErrors = Array.isArray(r.shape_errors) ? r.shape_errors.map((e) => String(e)) : [];
    throw new LogosSchemaError(
      typeof r.message === "string" && r.message
        ? r.message
        : `LOGOS ${schema} schema validation failed.`,
      schema,
      shapeErrors,
      exitCode,
    );
  }

  if (
    code === LOGOS_ERROR_CODES.invalidInput ||
    code === LOGOS_ERROR_CODES.unknownCommand ||
    code === LOGOS_ERROR_CODES.dlParseFailed ||
    code === LOGOS_ERROR_CODES.internalError
  ) {
    const message =
      typeof r.message === "string" && r.message ? r.message : `LOGOS failure: ${code}`;
    throw new LogosInputError(message, code, exitCode, r);
  }
}
