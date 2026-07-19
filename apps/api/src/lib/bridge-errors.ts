import {
  LogosBridgeError,
  LogosInputError,
  LogosNotAvailableError,
  LogosSchemaError,
  LogosTimeoutError,
} from "@auto/logos-bridge";
import { AppError, unavailable, solverError, solverSchemaError, solverTimeout, validationError } from "./errors.ts";

/**
 * Map a LOGOS bridge failure to the right HTTP-flavored AppError. Shared by
 * every service that calls the reasoning engine (SolverService,
 * RecognitionService, PolicyService, ForecastService).
 */
export function mapBridgeError(err: unknown): AppError {
  if (err instanceof LogosNotAvailableError) return unavailable(err.message, err.details);
  if (err instanceof LogosTimeoutError) return solverTimeout(err.message);
  if (err instanceof LogosSchemaError) {
    return solverSchemaError(err.message, {
      schema: err.schema,
      shapeErrors: err.shapeErrors,
      exitCode: err.exitCode,
    });
  }
  if (err instanceof LogosInputError) {
    return validationError(
      err.message,
      { errorCode: err.errorCode, exitCode: err.exitCode, ...(err.details && typeof err.details === "object" ? err.details : {}) },
      "SOLVER_INPUT_ERROR",
    );
  }
  if (err instanceof LogosBridgeError) return solverError(err.message, err.details);
  throw err;
}
