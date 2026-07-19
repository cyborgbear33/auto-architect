/**
 * The shared, camelCase vocabulary every app in auto-architect speaks. Mirrors
 * garden-architect's @garden/semantic-types — same shapes, vehicle-domain
 * content. Only @auto/logos-bridge is allowed to translate this into LOGOS's
 * snake_case wire format.
 */

export type SemanticId = string;
export type IsoTimestamp = string;

// --- Roles ---------------------------------------------------------------

export type Role = "owner" | "technician" | "viewer" | "automation_agent" | "admin";

// --- Vehicle profiles (the multi-vehicle axis) ----------------------------

/**
 * One row per vehicle you own. `engineFamily` selects which cartridges
 * (packages/cartridges) get loaded when recognizing this vehicle — see
 * packages/ontology/vehicle-profiles.json.
 */
export interface VehicleProfile {
  id: SemanticId;
  make: string;
  model: string;
  year: number | null;
  trim: string | null;
  engineFamily: string;
  vin?: string;
  obdProtocol?: string | null;
  odometerMiles?: number;
  notes?: string;
}

/** A manufacturer/engine grouping that determines which cartridges apply. */
export interface EngineFamily {
  id: string;
  label: string;
  /** Cartridge names (packages/cartridges) to load for vehicles in this family. */
  cartridges: string[];
}

// --- OBD-II evidence (what obd-gateway posts as Observations) ------------

export type DtcStatus = "stored" | "pending" | "permanent";

/** A single Diagnostic Trouble Code read off the vehicle's ECU(s). */
export interface DtcObservation {
  code: string; // e.g. "P0304"
  status: DtcStatus;
  ecu?: string; // e.g. "Powertrain" / "7E0"
  description?: string;
}

/** A single live-data (Mode 01) PID sample. */
export interface PidReading {
  pid: string; // e.g. "RPM", "ENGINE_LOAD", "SHORT_FUEL_TRIM_1"
  value: number;
  unit?: string;
  timestamp: IsoTimestamp;
}

/** Mode 02 snapshot captured at the moment a DTC set. */
export interface FreezeFrame {
  dtc: string;
  readings: PidReading[];
}

/** One row from a Mode 06 on-board monitoring test. */
export interface Mode06Result {
  tid: string;
  mid: string;
  value: number;
  min: number | null;
  max: number | null;
  passed: boolean | null;
}

export type ObservationSource = "obd_gateway" | "manual_entry" | "simulated";

/** The single envelope obd-gateway posts to `POST /api/vehicles/:id/observations`. */
export interface ObservationBatch {
  vehicleId: SemanticId;
  capturedAt: IsoTimestamp;
  source: ObservationSource;
  odometerMiles?: number;
  dtcs?: DtcObservation[];
  pids?: PidReading[];
  freezeFrames?: FreezeFrame[];
  mode06?: Mode06Result[];
}

// --- Problem/Solution vocabulary (LOGOS-facing) ---------------------------

export type ProblemType =
  | "Diagnostic"
  | "Design"
  | "Optimization"
  | "Decision"
  | "Prediction"
  | "Conflict"
  | "Moral"
  | "Learning"
  | "Stability";

export type ProblemStatus = "open" | "analyzing" | "solved" | "escalated" | "abandoned";

export type GapType =
  | "knowledge"
  | "resource"
  | "skill"
  | "design"
  | "execution"
  | "coordination"
  | "measurement"
  | "causal"
  | "value"
  | "constraint";

export type SolutionKind =
  | "act"
  | "measure-first"
  | "stabilize-first"
  | "clarify-values"
  | "escalate"
  | "none";

export type OutcomeStatus = "worked" | "partial" | "failed" | "inconclusive";

export interface ProblemOutcome {
  status: OutcomeStatus;
  recordedAt: IsoTimestamp;
  recordedBy: SemanticId;
  action?: string;
  evidence?: SemanticId[];
  note?: string;
}

export interface ProblemStatement {
  currentState: string;
  desiredState: string;
  gap: string;
  whyItMatters?: string;
  urgency?: "low" | "medium" | "high" | "critical";
  stakes?: string;
}

export interface DesiredStateSpec {
  successCriteria?: string;
  measurement?: string;
  minimumAcceptable?: string;
  ideal?: string;
  deadline?: IsoTimestamp;
  nonNegotiableConstraints?: string[];
  acceptableTradeoffs?: string[];
}

export interface CausalModel {
  symptoms?: string[];
  possibleCauses?: string[];
  mostLikelyCauses?: string[];
  rootCauses?: string[];
  feedbackLoops?: string[];
}

/**
 * A proposed diagnostic/repair action scored by the solver. Mirrors LOGOS's
 * `Action`. `id` is a free-form plan key (e.g. "swap-coil-1-4"), not a
 * SemanticId — candidate actions are hypothetical until logged as a repair.
 */
export interface CandidateAction {
  id: string;
  description?: string;
  impact?: number;
  confidence?: number;
  infoGain?: number;
  cost?: number;
  risk?: number;
  reversibility?: number;
  alignment?: number;
  tags?: string[];
  violates?: string[];
  firstStep?: string;
  stopConditions?: string;
}

export interface RankedAction {
  action: CandidateAction;
  score: number;
}

export interface DisqualifiedAction {
  actionId: string;
  violatedConstraints: string[];
}

export interface FactorFlip {
  factor: string;
  current: number;
  needed: number;
  direction: "increase" | "decrease";
}

export interface FactorTolerance {
  factor: string;
  current: number;
  breakEven: number;
  direction: "falls_below" | "rises_above";
}

export interface Counterfactual {
  actionId: string;
  score: number;
  isTop: boolean;
  rank: number;
  flips?: FactorFlip[];
  robustness?: FactorTolerance[];
}

/** The LOGOS Solution, camelCased — the ranked-next-step answer to a DiagnosticProblem. */
export interface DiagnosticSolution {
  problemId: string;
  types: ProblemType[];
  pattern: string;
  ranked: RankedAction[];
  disqualified: DisqualifiedAction[];
  recommended: string | null;
  kind: SolutionKind;
  rationale: string;
  confidence: number | null;
  certainty: string;
  antiPatterns: string[];
  escalations: string[];
  counterfactuals?: Counterfactual[];
}

/** A diagnostic case for one vehicle: a drafted Problem plus its solved Solution. */
export interface DiagnosticProblem {
  id: SemanticId;
  vehicleId: SemanticId;
  status: ProblemStatus;
  statement: ProblemStatement;
  problemType?: ProblemType | ProblemType[];
  gapType?: GapType;
  desiredState?: DesiredStateSpec;
  causalModel?: CausalModel;
  actions: CandidateAction[];
  triggeredByClass?: string;
  solution?: DiagnosticSolution;
  outcome?: ProblemOutcome;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// --- Recognition (LOGOS realize, camelCased) ------------------------------

export interface Recognition {
  individual: SemanticId;
  member: string[];
  mostSpecific: string[];
  undecided?: string[];
}

// --- Recommendations & decision journal -----------------------------------

export type RecommendationStatus =
  | "new"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted_to_repair"
  | "dismissed";

export interface Recommendation {
  id: SemanticId;
  vehicleId: SemanticId;
  title: string;
  priority: "low" | "normal" | "high" | "critical";
  status: RecommendationStatus;
  reason: string;
  confidence?: number;
  generatedFromClasses: string[];
  generatedByProblem?: SemanticId;
  createdAt: IsoTimestamp;
}

/** Audited "why we chose X" — one row per enacted diagnostic/repair action. */
export interface DecisionRecord {
  id: SemanticId;
  vehicleId: SemanticId;
  problemId: SemanticId;
  actionId: string;
  rationale: string;
  policyAllowed: boolean;
  policyExplanation?: string;
  decidedAt: IsoTimestamp;
  decidedBy: SemanticId;
  outcome?: ProblemOutcome;
}

// --- Known campaigns (TSBs / recalls) -------------------------------------

/** A manufacturer campaign (recall / customer satisfaction notification / TSB). */
export interface KnownCampaign {
  id: string; // e.g. "W80"
  title: string;
  engineFamily: string;
  yearRange: [number, number];
  summary: string;
  reference?: string; // TSB/NHTSA doc id
}
