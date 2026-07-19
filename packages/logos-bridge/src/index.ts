/**
 * @auto/logos-bridge
 *
 * Node bridge to the LOGOS reasoning engine. It owns the LOGOS wire contract
 * (the snake_case <-> camelCase seam) so the rest of auto-architect only ever
 * sees camelCase DiagnosticProblem/DiagnosticSolution.
 *
 * Usage:
 *   const bridge = createLogosBridge();                      // warm serve (default)
 *   const bridge = createLogosBridge({ transport: "subprocess" }); // one-shot
 *   const solution = await bridge.solve(logosInput);          // DiagnosticSolution
 *
 * Tests should inject `new FakeLogosBridge()` instead (Python-free).
 */
export {
  createLogosBridge,
  type LogosBridge,
  type LogosBridgeConfig,
  type LogosTransport,
  type ExecFn,
} from "./bridge.ts";
export { FakeLogosBridge } from "./fake.ts";
export {
  createLogosServeClient,
  payloadFromServeReply,
  type LogosServeClient,
  type ServeRequest,
  type ServeReply,
} from "./serve-client.ts";
export {
  LOGOS_SCHEMA_VERSION,
  LOGOS_MIN_ENGINE_VERSION,
  compareEngineVersion,
  readWireMeta,
  assertWireMetaCompatible,
  toWireProblem,
  solutionFromWire,
  toLogosProblemId,
  fromLogosProblemId,
  toRealizeFile,
  realizeResultFromWire,
  toReviseFile,
  reviseResultFromWire,
  toForecastFile,
  forecastResultFromWire,
  toReasonFile,
  reasonResultFromWire,
  emptyReasonResult,
  toVerbalizeArgs,
  verbalizeResultFromWire,
  toStrategizeFile,
  strategizeResultFromWire,
  toOntologyLintFile,
  ontologyLintResultFromWire,
  emptyOntologyLintResult,
  type LogosWireMeta,
  type LogosProblemInput,
  type RealizeInput,
  type RealizeScopeMeta,
  type RealizeResult,
  type RealizeLimits,
  type ReviseInput,
  type ReviseResult,
  type ForecastInput,
  type ForecastResult,
  type ReasonInput,
  type ReasonResult,
  type ReasonRule,
  type ReasonResolution,
  type ReasonRealized,
  type VerbalizeInput,
  type VerbalizeResult,
  type StrategizeInput,
  type StrategizeResult,
  type OntologyLintInput,
  type OntologyLintConfig,
  type OntologyLintCatalogEntry,
  type OntologyLintIssue,
  type OntologyLintResult,
} from "./types.ts";
export {
  LogosBridgeError,
  LogosInputError,
  LOGOS_ERROR_CODES,
  throwIfStructuredFailure,
  LogosTimeoutError,
  LogosSolveError,
  LogosProtocolError,
  LogosSchemaError,
  LogosNotAvailableError,
  throwIfSchemaValidationFailed,
} from "./errors.ts";
