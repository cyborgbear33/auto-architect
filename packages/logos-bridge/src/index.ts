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
  type ExecFn,
  type LogosBridge,
  type LogosBridgeConfig,
  type LogosTransport,
} from "./bridge.ts";
export {
  LOGOS_ERROR_CODES,
  LogosBridgeError,
  LogosInputError,
  LogosNotAvailableError,
  LogosProtocolError,
  LogosSchemaError,
  LogosSolveError,
  LogosTimeoutError,
  throwIfSchemaValidationFailed,
  throwIfStructuredFailure,
} from "./errors.ts";
export { FakeLogosBridge } from "./fake.ts";
export {
  createLogosServeClient,
  type LogosServeClient,
  payloadFromServeReply,
  type ServeReply,
  type ServeRequest,
} from "./serve-client.ts";
export {
  assertWireMetaCompatible,
  compareEngineVersion,
  emptyOntologyLintResult,
  emptyReasonResult,
  type ForecastInput,
  type ForecastResult,
  forecastResultFromWire,
  fromLogosProblemId,
  LOGOS_MIN_ENGINE_VERSION,
  LOGOS_SCHEMA_VERSION,
  type LogosProblemInput,
  type LogosWireMeta,
  type OntologyLintCatalogEntry,
  type OntologyLintConfig,
  type OntologyLintInput,
  type OntologyLintIssue,
  type OntologyLintResult,
  ontologyLintResultFromWire,
  type RealizeInput,
  type RealizeLimits,
  type RealizeResult,
  type RealizeScopeMeta,
  type ReasonInput,
  type ReasonRealized,
  type ReasonResolution,
  type ReasonResult,
  type ReasonRule,
  type ReviseInput,
  type ReviseResult,
  readWireMeta,
  realizeResultFromWire,
  reasonResultFromWire,
  reviseResultFromWire,
  type StrategizeInput,
  type StrategizeResult,
  solutionFromWire,
  strategizeResultFromWire,
  toForecastFile,
  toLogosProblemId,
  toOntologyLintFile,
  toRealizeFile,
  toReasonFile,
  toReviseFile,
  toStrategizeFile,
  toVerbalizeArgs,
  toWireProblem,
  type VerbalizeInput,
  type VerbalizeResult,
  verbalizeResultFromWire,
} from "./types.ts";
