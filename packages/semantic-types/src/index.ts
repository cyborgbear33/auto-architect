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
 * Operator-asserted mechanical / chassis condition (F8). Never inferred from
 * OBD alone — used only as cascade-edge antecedents (`manualCondition`).
 */
export interface ManualCondition {
  /** Catalog id, e.g. `BrakePadThin`. */
  id: string;
  notedAt: IsoTimestamp;
  note?: string;
}

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
  /** Operator-entered wear / condition stages for cascade prognosis (F8). */
  manualConditions?: ManualCondition[];
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

/**
 * One row from a Mode 06 on-board monitoring test (CAN / ISO 15765-4).
 * `mid` is the SAE/ISO OBDMID (monitor); `tid` is the test within that monitor.
 * Monitor meaning comes from `mode06-dictionary.json` — never invent TID labels.
 */
export interface Mode06Result {
  /** Test ID within the monitor (standardized or manufacturer-defined). */
  tid: string;
  /** On-Board Diagnostic Monitor ID (OBDMID), e.g. `"21"` for catalyst bank 1. */
  mid: string;
  value: number;
  min: number | null;
  max: number | null;
  passed: boolean | null;
}

export type ObservationSource =
  | "obd_gateway"
  | "manual_entry"
  | "simulated"
  /** Restored or uploaded via garage JSON import. */
  | "imported_file";

/** Support ternary for discovery probes (null = unknown / not probed). */
export type SupportFlag = boolean | null;

/** Raw capability report from obd-gateway `discover` (support probe, not values). */
export interface ObdCapabilityReport {
  vehicleId: SemanticId;
  capturedAt: IsoTimestamp;
  source: ObservationSource;
  connection: {
    connected: boolean;
    port: string | null;
    protocolId: string | null;
    protocolName: string | null;
  };
  modes: {
    mode01: { supported: string[]; unsupported: string[]; unknown: string[] };
    mode02FreezeFrame: { supported: SupportFlag };
    mode03Dtcs: { supported: SupportFlag };
    mode07Pending: { supported: SupportFlag };
    mode06: { supportedMids: string[]; unsupportedMids: string[]; unknownMids: string[] };
    vin: { supported: SupportFlag };
  };
  manualOnlyPids: string[];
}

export type DiscoverySupportStatus = "supported" | "unsupported" | "unknown" | "manual_only";

export interface DiscoveryPidRow {
  pid: string;
  support: DiscoverySupportStatus;
  description: string | null;
  unit: string | null;
  pidHex: string | null;
  inOntology: boolean;
  inDefaultPoll: boolean;
  cartridgeRelevant: boolean;
}

export interface DiscoveryMode06Row {
  mid: string;
  support: DiscoverySupportStatus;
  description: string | null;
  concept: string | null;
  inOntology: boolean;
}

/** One chapter of the vehicle / OBD mastery guide (in-app Guide page). */
export interface MasteryGuideSection {
  id: string;
  title: string;
  /** Section body markdown (without the `##` heading line). */
  markdown: string;
}

/** Personalized peace-of-mind curriculum for a selected vehicle. */
export interface MasteryGuide {
  vehicleId: SemanticId;
  title: string;
  generatedAt: IsoTimestamp;
  sections: MasteryGuideSection[];
  markdown: string;
  html: string;
}

/** Ontology-enriched vehicle intelligence / forensics report. */
export interface DiscoveryForensicsReport {
  vehicleId: SemanticId;
  capturedAt: IsoTimestamp;
  source: ObservationSource;
  vehicle: {
    make: string;
    model: string;
    year: number | null;
    trim: string | null;
    engineFamily: string;
    profileObdProtocol: string | null;
  };
  hardware: {
    preferredAdapter: string;
    adapterNotes: string[];
    connection: ObdCapabilityReport["connection"];
  };
  summary: {
    mode01Supported: number;
    mode01Unsupported: number;
    mode01Unknown: number;
    mode06Supported: number;
    mode06Unsupported: number;
    mode06Unknown: number;
    freezeFrame: SupportFlag;
    mode03Dtcs: SupportFlag;
    mode07Pending: SupportFlag;
    vin: SupportFlag;
    unmappedSupportedPids: number;
    cartridgeRelevantAvailable: number;
  };
  mode01: DiscoveryPidRow[];
  mode06: DiscoveryMode06Row[];
  unmappedSupportedPids: string[];
  narrative: string[];
  markdown: string;
  html: string;
}

/** The single envelope obd-gateway posts to `POST /api/vehicles/:id/observations`. */
export interface ObservationBatch {
  vehicleId: SemanticId;
  capturedAt: IsoTimestamp;
  source: ObservationSource;
  odometerMiles?: number;
  /** Optional link to a DriveSession (watch / simulated drive). */
  sessionId?: SemanticId;
  dtcs?: DtcObservation[];
  pids?: PidReading[];
  freezeFrames?: FreezeFrame[];
  mode06?: Mode06Result[];
}

/** One continuous observation window (live watch or simulated drive). */
export interface DriveSession {
  id: SemanticId;
  vehicleId: SemanticId;
  startedAt: IsoTimestamp;
  endedAt?: IsoTimestamp;
  source: ObservationSource;
  label?: string;
  odometerStartMiles?: number;
  odometerEndMiles?: number;
  /** Set when ended — count of batches linked by sessionId. */
  batchCount?: number;
}

/**
 * Compose-only rollup of a drive session for reports / UI.
 * Never invents fault classes — only aggregates linked batches.
 */
export interface DriveSessionSummary {
  session: DriveSession;
  /** Prefer ended sessions; true when summarizing an in-progress watch. */
  open: boolean;
  durationSec?: number;
  batchCount: number;
  dtcCodes: string[];
  freezeFrameCount: number;
  mode06Count: number;
  maxRpm?: number;
  maxEngineLoad?: number;
  maxShortFuelTrim1?: number;
  coolantMinC?: number;
  coolantMaxC?: number;
}

/** Result of applying the observation retention policy. */
export interface RetentionResult {
  vehicleId: SemanticId;
  beforeCount: number;
  afterCount: number;
  removedCount: number;
  keptEvidenceBatches: number;
  keptPidBatches: number;
}

/**
 * Trust chrome for evidence: where the latest batch came from, and which
 * sources have contributed to this vehicle's stored history.
 */
export interface EvidenceProvenance {
  latestSource: ObservationSource | null;
  latestCapturedAt: IsoTimestamp | null;
  batchCount: number;
  sourcesSeen: ObservationSource[];
}

/** One live-gauge cell: latest PID reading with dictionary metadata + freshness. */
export interface LiveGaugeReading {
  pid: string;
  label: string;
  value: number | null;
  unit: string | null;
  timestamp: IsoTimestamp | null;
}

/** Dashboard Operate strip — latest gauge PIDs plus strip-level staleness. */
export interface LiveGaugeStrip {
  vehicleId: SemanticId;
  source: ObservationSource | null;
  capturedAt: IsoTimestamp | null;
  /** Milliseconds since `capturedAt` (null when no batches). */
  ageMs: number | null;
  /** True when age exceeds the live-watch freshness threshold. */
  stale: boolean;
  staleAfterMs: number;
  gauges: LiveGaugeReading[];
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

export type ProblemStatus =
  | "open"
  | "analyzing"
  | "verifying"
  | "solved"
  | "escalated"
  | "abandoned";

/** Post-repair verification before a case is truly closed. */
export interface ProblemVerification {
  startedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  result?: "passed" | "failed" | "inconclusive";
  note?: string;
  /** Classes still proven when verify ran (empty ⇒ cleared). */
  stillProven?: string[];
}

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
  /** Set while status is `verifying` or after a verify check. */
  verification?: ProblemVerification;
  /** Prior case id when this problem was reopened from a closed one. */
  reopenedFromId?: SemanticId;
  /** Append-only lifecycle stamps (opened, abandon, verify, …). */
  lifecycleEvents?: ProblemLifecycleEvent[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// --- Recognition (LOGOS realize, camelCased) ------------------------------

/** Plain-English narration for a proven class (verbalize and/or ontology note). */
export interface ClassNarration {
  className: string;
  fluent: string;
  source: "verbalize" | "ontology_note" | "class_name";
}

/** Supporting observations for one proven class (A1) — compose-only. */
export interface ClassEvidence {
  className: string;
  dtcs: DtcObservation[];
  pids: Array<{
    pid: string;
    value: number;
    unit?: string;
    thresholdMet?: boolean;
  }>;
  freezeFrames: FreezeFrame[];
  /** Failed / related Mode 06 rows whose OBDMID concept this class uses (A3). */
  mode06: Mode06Result[];
}

export interface Recognition {
  individual: SemanticId;
  member: string[];
  mostSpecific: string[];
  undecided?: string[];
  /** Operator-facing explanations for `mostSpecific` classes. */
  narration?: ClassNarration[];
  /** Per-`mostSpecific` supporting DTCs / key PIDs / matching freeze-frames (A1). */
  classEvidence?: ClassEvidence[];
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

/** Where a recommendation card came from — never invent classes for campaigns/procedures. */
export type RecommendationSource = "class" | "campaign" | "procedure";

export interface Recommendation {
  id: SemanticId;
  vehicleId: SemanticId;
  title: string;
  priority: "low" | "normal" | "high" | "critical";
  status: RecommendationStatus;
  reason: string;
  /**
   * Operator-facing calibration note when outcomes moved priority/confidence
   * (F5). Shown as a chip — not a probability claim.
   */
  calibrationExplain?: string;
  confidence?: number;
  /** Rough playbook cost 0–1 from the top suggested action (R2). */
  cost?: number;
  /** Rough playbook risk 0–1 from the top suggested action (R2). */
  risk?: number;
  /** Action id whose cost/risk were copied onto the card. */
  suggestedActionId?: string;
  /**
   * Proven fault classes that framed this card (realize + cartridge).
   * Empty for campaign/TSB/procedure applicability cards (R5).
   */
  generatedFromClasses: string[];
  /** OEM campaign / TSB ids that produced this card (R5). */
  generatedFromCampaignIds?: string[];
  /** Special-procedure ids (e.g. Proxi) that produced this card. */
  generatedFromProcedureIds?: string[];
  /** Discriminator for UI + convert. Defaults to class when omitted (legacy). */
  source?: RecommendationSource;
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
  /** Vehicle odometer snapshot when the repair was logged (H3). */
  odometerMiles?: number;
  /** Open drive session at log time, when any (H3). */
  sessionId?: SemanticId;
}

/**
 * Aggregated confirmed-fix memory from DecisionRecord + ProblemOutcome,
 * joined to DiagnosticProblem.triggeredByClass when available.
 */
export interface SolutionRollupBucket {
  actionId: string;
  faultClass: string | null;
  scope: "vehicle" | "engineFamily";
  engineFamily: string;
  worked: number;
  partial: number;
  failed: number;
  inconclusive: number;
  /** Decisions that carried an outcome (excludes bare audit rows). */
  totalWithOutcome: number;
  lastDecidedAt: IsoTimestamp | null;
}

/** Vehicle + engine-family solution history for "what worked before". */
export interface SolutionHistory {
  vehicleId: SemanticId;
  engineFamily: string;
  /** Optional filter applied by the API (`?class=`). */
  faultClassFilter: string | null;
  vehicle: SolutionRollupBucket[];
  engineFamilyRollup: SolutionRollupBucket[];
}

/**
 * Derived case-narrative events from DiagnosticProblem + DecisionRecord.
 * Not a full audit log — lifecycle flips without durable stamps are best-effort.
 */
export type CaseTimelineEventType =
  | "opened"
  | "ranked"
  | "repair_logged"
  | "verify_started"
  | "verify_result"
  | "closed_solved"
  | "abandoned"
  | "escalated"
  | "reopened";

/**
 * Durable stamp written by ActionService on each lifecycle transition.
 * Timeline prefers these over synthesizing from current status + updatedAt.
 */
export interface ProblemLifecycleEvent {
  id: string;
  type: Exclude<CaseTimelineEventType, "repair_logged">;
  at: IsoTimestamp;
  note?: string;
  verifyResult?: "passed" | "failed" | "inconclusive";
  reopenedFromId?: SemanticId;
  solutionKind?: string;
  /** Vehicle odometer snapshot when the transition was stamped (H3). */
  odometerMiles?: number;
  /** Open drive session at stamp time, when any (H3). */
  sessionId?: SemanticId;
}

export interface CaseTimelineEvent {
  id: string;
  type: CaseTimelineEventType;
  at: IsoTimestamp;
  problemId: SemanticId;
  vehicleId: SemanticId;
  faultClass?: string;
  summary: string;
  actionId?: string;
  outcomeStatus?: OutcomeStatus;
  verifyResult?: "passed" | "failed" | "inconclusive";
  decisionId?: string;
  reopenedFromId?: SemanticId;
  note?: string;
  solutionKind?: string;
  odometerMiles?: number;
  sessionId?: SemanticId;
}

/** Chronological case timeline for a vehicle (optionally one problem). */
export interface CaseTimeline {
  vehicleId: SemanticId;
  problemIdFilter: SemanticId | null;
  /** Oldest → newest. */
  events: CaseTimelineEvent[];
}

/** Portable garage snapshot for backup / migrate (JSON dump). */
export const GARAGE_DUMP_FORMAT = "auto-architect.garage" as const;
export const GARAGE_DUMP_VERSION = 1 as const;

export interface GarageDump {
  format: typeof GARAGE_DUMP_FORMAT;
  version: typeof GARAGE_DUMP_VERSION;
  exportedAt: IsoTimestamp;
  scope: "garage" | "vehicle";
  vehicleId: SemanticId | null;
  vehicles: VehicleProfile[];
  observations: ObservationBatch[];
  problems: DiagnosticProblem[];
  decisions: DecisionRecord[];
  recommendations: Recommendation[];
}

export interface GarageImportResult {
  vehiclesUpserted: number;
  observationsAppended: number;
  observationsSkipped: number;
  problemsUpserted: number;
  decisionsUpserted: number;
  recommendationsUpserted: number;
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

// --- Cascade prognosis (F6/F7) ----------------------------------------------

/** Ordinal shop prior — never presented as a calibrated probability. */
export type CascadeBand = "Watch" | "Elevated" | "High";

export type CascadeAntecedentKind =
  | "provenClass"
  | "trend"
  | "openProblemClass"
  | "manualCondition";

export interface CascadeAntecedentRef {
  kind: CascadeAntecedentKind;
  id: string;
}

export interface CascadeConsequentRef {
  kind: "watchClass";
  id: string;
}

/** Curated antecedent → consequent edge (ontology catalog). */
export interface CascadeEdge {
  id: string;
  antecedent: CascadeAntecedentRef;
  consequent: CascadeConsequentRef;
  band: CascadeBand;
  rationale: string;
  horizon?: string;
  /** Null/omit = all families; otherwise only those engineFamily ids. */
  engineFamilies?: string[] | null;
}

export interface CascadeWatchItem {
  edgeId: string;
  band: CascadeBand;
  consequentClass: string;
  rationale: string;
  horizon?: string;
  matchedAntecedent: CascadeAntecedentRef;
  /** Why this edge fired for this vehicle right now. */
  evidence: string[];
}

/** On-command propose-only watchlist — does not invent realize membership. */
export interface CascadePrognosis {
  vehicleId: SemanticId;
  generatedAt: IsoTimestamp;
  items: CascadeWatchItem[];
  /** Honest empty-state note when nothing matched. */
  emptyReason?: string;
}
