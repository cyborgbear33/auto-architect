/** A structured, surfaceable error. Never throw bare strings to clients. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toApiError(): ApiErrorBody {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError("NOT_FOUND", id ? `${what} not found: ${id}` : `${what} not found`, 404);

export const validationError = (message: string, details?: unknown, code = "VALIDATION_ERROR") =>
  new AppError(code, message, 422, details);

/** An action refused by an enforcing declarative policy (e.g. a safety hold from `reason`). */
export const policyBlocked = (message: string, details?: unknown) =>
  new AppError("POLICY_BLOCKED", message, 403, details);

export const conflict = (message: string) => new AppError("CONFLICT", message, 409);

// --- external reasoning engine (LOGOS) failures -------------------------------
// These are NOT client-input problems (that would be validationError/422); they
// are failures of the external reasoning dependency the API proxies to.
export const unavailable = (message: string, details?: unknown) =>
  new AppError("SOLVER_UNAVAILABLE", message, 503, details);

export const solverError = (message: string, details?: unknown) =>
  new AppError("SOLVER_ERROR", message, 502, details);

export const solverTimeout = (message: string) => new AppError("SOLVER_TIMEOUT", message, 504);

export const solverSchemaError = (message: string, details?: unknown) =>
  new AppError("SOLVER_SCHEMA_ERROR", message, 422, details);
