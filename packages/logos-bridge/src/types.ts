/**
 * The LOGOS wire contract and the camelCase <-> snake_case mapping. This is the
 * ONE place that knows LOGOS's `problem.schema.json` / `solve --json` field
 * names — the seam. Everything else in auto-architect stays camelCase.
 *
 * Adapted from @garden/logos-bridge/types.ts: `GardenSolution` -> `DiagnosticSolution`,
 * `@garden/semantic-types` -> `@auto/semantic-types`. The wire contract itself
 * (LOGOS's actual protocol) is unchanged — the engine is domain-agnostic.
 */

import type { CooperativeAnalysis, CriterionResult, DecisionAnalysis } from "@auto/game-theory";
import type {
  CandidateAction,
  CausalModel,
  DesiredStateSpec,
  DiagnosticSolution,
  GapType,
  ProblemStatement,
  ProblemType,
} from "@auto/semantic-types";
import { LogosProtocolError } from "./errors.ts";

/** Breaking bumps only — additive payload fields do not change this. */
export const LOGOS_SCHEMA_VERSION = "1";

/**
 * Minimum `engine_version` when the engine reports one. Override with
 * `LOGOS_MIN_ENGINE_VERSION` (e.g. in CI). Absence of `engine_version` is still
 * tolerated so FakeLogosBridge / bare fixtures keep working.
 */
export const LOGOS_MIN_ENGINE_VERSION =
  (typeof process !== "undefined" && process.env?.LOGOS_MIN_ENGINE_VERSION) || "0.1.0";

/** Additive top-level metadata on every real LOGOS `--json` / serve reply. */
export interface LogosWireMeta {
  engineVersion?: string;
  schemaVersion?: string;
  command?: string;
}

/** Compare dotted numeric versions (e.g. "0.1.0"); returns <0 / 0 / >0. */
export function compareEngineVersion(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Narrow a JSON-ish wire payload to a string-keyed object without using `any`.
 * Arrays / primitives become `{}` so callers can keep `r.field ?? default` style.
 */
function asWireObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function asWireArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/** Read protocol metadata when present; missing keys are fine (Fake / old fixtures). */
export function readWireMeta(raw: unknown): LogosWireMeta {
  const r = asWireObject(raw);
  return {
    engineVersion: typeof r.engine_version === "string" ? r.engine_version : undefined,
    schemaVersion: typeof r.schema_version === "string" ? r.schema_version : undefined,
    command: typeof r.command === "string" ? r.command : undefined,
  };
}

/**
 * When `schema_version` is present and not the version we speak, fail clearly.
 * When `engine_version` is present and below `LOGOS_MIN_ENGINE_VERSION`, fail.
 * Absence of either is tolerated so FakeLogosBridge / bare unit fixtures keep working.
 */
export function assertWireMetaCompatible(raw: unknown): LogosWireMeta {
  const meta = readWireMeta(raw);
  if (meta.schemaVersion !== undefined && meta.schemaVersion !== LOGOS_SCHEMA_VERSION) {
    throw new LogosProtocolError(
      `LOGOS schema_version "${meta.schemaVersion}" is incompatible with bridge schema_version "${LOGOS_SCHEMA_VERSION}". Upgrade @auto/logos-bridge or pin a matching metalanguage engine.`,
      { meta },
    );
  }
  if (
    meta.engineVersion !== undefined &&
    compareEngineVersion(meta.engineVersion, LOGOS_MIN_ENGINE_VERSION) < 0
  ) {
    throw new LogosProtocolError(
      `LOGOS engine_version "${meta.engineVersion}" is below minimum "${LOGOS_MIN_ENGINE_VERSION}". Upgrade the metalanguage engine (e.g. pin logos-v${LOGOS_MIN_ENGINE_VERSION}) or lower LOGOS_MIN_ENGINE_VERSION.`,
      { meta },
    );
  }
  return meta;
}

/**
 * The auto-architect-facing input the bridge accepts (a camelCase projection
 * of the LOGOS-relevant fields of a DiagnosticProblem). The bridge converts it
 * to LOGOS's snake_case Problem payload internally.
 */
export interface LogosProblemInput {
  id: string;
  statement: ProblemStatement;
  problemType?: ProblemType | ProblemType[];
  gapType?: GapType;
  desiredState?: DesiredStateSpec;
  constraints?: string[];
  causalModel?: CausalModel;
  actions?: CandidateAction[];
}

/** Drop undefined keys so we never emit `"x": null` where LOGOS expects absence. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/**
 * LOGOS Problem JSON Schema requires `id` to match `^PRB_`. Auto-architect
 * stores semantic ids like `problem:…`. Map at the wire seam (reversible via
 * {@link fromLogosProblemId}) so app ids stay camelCase/semantic.
 */
export function toLogosProblemId(id: string): string {
  return id.startsWith("PRB_") ? id : `PRB_${id}`;
}

/** Inverse of {@link toLogosProblemId} for auto-architect-style ids (`…:…`). */
export function fromLogosProblemId(id: string): string {
  if (id.startsWith("PRB_") && id.includes(":")) return id.slice("PRB_".length);
  return id;
}

/** camelCase LogosProblemInput -> the snake_case dict LOGOS's `solve` reads. */
export function toWireProblem(input: LogosProblemInput): Record<string, unknown> {
  const s = input.statement;
  const d = input.desiredState;
  const c = input.causalModel;
  return compact({
    // Omit when missing so LOGOS schema fail-fast reports required `id` (exit 2).
    id:
      typeof input.id === "string" && input.id.length > 0 ? toLogosProblemId(input.id) : undefined,
    kind: "Problem",
    level: "L1",
    statement: s
      ? compact({
          current_state: s.currentState,
          desired_state: s.desiredState,
          gap: s.gap,
          why_it_matters: s.whyItMatters,
          urgency: s.urgency,
          stakes: s.stakes,
        })
      : undefined,
    problem_type: input.problemType,
    gap_type: input.gapType,
    desired_state: d
      ? compact({
          success_criteria: d.successCriteria,
          measurement: d.measurement,
          minimum_acceptable: d.minimumAcceptable,
          ideal: d.ideal,
          deadline: d.deadline,
          non_negotiable_constraints: d.nonNegotiableConstraints,
          acceptable_tradeoffs: d.acceptableTradeoffs,
        })
      : undefined,
    constraints: input.constraints,
    causal_model: c
      ? compact({
          symptoms: c.symptoms,
          possible_causes: c.possibleCauses,
          most_likely_causes: c.mostLikelyCauses,
          root_causes: c.rootCauses,
          feedback_loops: c.feedbackLoops,
        })
      : undefined,
    actions: input.actions?.map((a) =>
      compact({
        id: a.id,
        description: a.description,
        impact: a.impact,
        confidence: a.confidence,
        info_gain: a.infoGain,
        cost: a.cost,
        risk: a.risk,
        reversibility: a.reversibility,
        alignment: a.alignment,
        tags: a.tags,
        violates: a.violates,
        first_step: a.firstStep,
        stop_conditions: a.stopConditions,
      }),
    ),
  });
}

// --- solve --json output -> DiagnosticSolution -------------------------------

function actionFromWire(raw: unknown): CandidateAction {
  const a = asWireObject(raw);
  return {
    id: String(a.id ?? ""),
    description: typeof a.description === "string" ? a.description : undefined,
    impact: typeof a.impact === "number" ? a.impact : undefined,
    confidence: typeof a.confidence === "number" ? a.confidence : undefined,
    infoGain: typeof a.info_gain === "number" ? a.info_gain : undefined,
    cost: typeof a.cost === "number" ? a.cost : undefined,
    risk: typeof a.risk === "number" ? a.risk : undefined,
    reversibility: typeof a.reversibility === "number" ? a.reversibility : undefined,
    alignment: typeof a.alignment === "number" ? a.alignment : undefined,
    tags: Array.isArray(a.tags) ? a.tags.map(String) : undefined,
    violates: Array.isArray(a.violates) ? a.violates.map(String) : undefined,
    firstStep: typeof a.first_step === "string" ? a.first_step : undefined,
    stopConditions: typeof a.stop_conditions === "string" ? a.stop_conditions : undefined,
  };
}

// --- realize (ABox instance realization) -------------------------------------

/**
 * Input to `logos realize`: a LOGOS DL ontology (subtypes/classes/roles/…), an
 * ABox of assertions about individuals, and the individual to classify.
 */
export interface RealizeInput {
  ontology: Record<string, unknown>;
  abox: { concepts: Record<string, string[]>; roles: Array<[string, string, string]> };
  individual: string;
  /** Named classes to test membership against; defaults to the ontology's. */
  classify?: string[];
  /** Named view from ontology.views (LOGOS scoped realize). */
  view?: string;
  /** Explicit scope object, or auto-prune (`true`/`"auto"`). */
  scope?: Record<string, unknown> | true | "auto";
}

export interface RealizeScopeMeta {
  projected: boolean;
  classes?: number;
  roles?: number;
  subtypes?: number;
  gci?: number;
  disjoint?: number;
  fullClasses?: number;
  fullRoles?: number;
  auto?: boolean;
}

/** Honesty flags when the tableau could not decide some memberships. */
export interface RealizeLimits {
  /** Undecidable axioms were dropped from the TBox reduct. */
  droppedAxioms: boolean;
  /** Tableau `_NODE_CAP` was hit during a membership check. */
  nodeCap: boolean;
}

export interface RealizeResult {
  individual: string;
  /** All named classes the individual provably belongs to. */
  member: string[];
  /** The most-specific of those (a member is dropped if a strict subclass is too). */
  mostSpecific: string[];
  /**
   * Classes where the tableau returned undecided (node-cap / dropped axioms).
   * **Never treat absence from `member` as negation when listed here.**
   */
  undecided: string[];
  /** Optional honesty flags (newer LOGOS engines). */
  limits?: RealizeLimits;
  /** Optional scope projection metadata (newer LOGOS engines). */
  scopeMeta?: RealizeScopeMeta;
}

/** The flat JSON payload the `realize` CLI reads (ontology fields at top level). */
export function toRealizeFile(input: RealizeInput): Record<string, unknown> {
  const scope = input.scope === true ? "auto" : input.scope;
  return {
    ...input.ontology,
    abox: input.abox,
    individual: input.individual,
    ...(input.classify ? { classify: input.classify } : {}),
    ...(input.view ? { view: input.view } : {}),
    ...(scope !== undefined ? { scope } : {}),
  };
}

export function realizeResultFromWire(raw: unknown): RealizeResult {
  const r = asWireObject(raw);
  const scope = r.scope != null ? asWireObject(r.scope) : null;
  const limits = r.limits != null ? asWireObject(r.limits) : null;
  return {
    individual: String(r.individual ?? ""),
    member: asWireArray(r.member).map(String),
    mostSpecific: asWireArray(r.most_specific).map(String),
    undecided: asWireArray(r.undecided).map(String),
    limits: limits
      ? {
          droppedAxioms: limits.dropped_axioms === true,
          nodeCap: limits.node_cap === true,
        }
      : undefined,
    scopeMeta: scope
      ? {
          projected: scope.projected === true,
          classes: typeof scope.classes === "number" ? scope.classes : undefined,
          roles: typeof scope.roles === "number" ? scope.roles : undefined,
          subtypes: typeof scope.subtypes === "number" ? scope.subtypes : undefined,
          gci: typeof scope.gci === "number" ? scope.gci : undefined,
          disjoint: typeof scope.disjoint === "number" ? scope.disjoint : undefined,
          fullClasses: typeof scope.full_classes === "number" ? scope.full_classes : undefined,
          fullRoles: typeof scope.full_roles === "number" ? scope.full_roles : undefined,
          auto: scope.auto === true,
        }
      : undefined,
  };
}

// --- ontology-lint (registry ↔ DL registry drift) ----------------------------

export interface OntologyLintCatalogEntry {
  id?: string;
  dlConcept: string;
  family?: string;
}

export interface OntologyLintConfig {
  plantParent?: string;
  traitClasses?: string[];
  traitAxes?: [string, string][];
  families?: string[];
  seededOutsideCatalog?: string[];
  minPlantTaxa?: number;
}

export interface OntologyLintInput {
  ontology: Record<string, unknown>;
  catalog?: OntologyLintCatalogEntry[];
  config?: OntologyLintConfig;
}

export interface OntologyLintIssue {
  code: string;
  message: string;
  taxon?: string;
  families?: string[];
  axis?: string[];
  catalogFamily?: string;
  ontologyFamilies?: string[];
  id?: string;
  count?: number;
  min?: number;
}

export interface OntologyLintResult {
  ok: boolean;
  plantParent: string;
  plantTaxa: string[];
  plantTaxaCount: number;
  families: Record<string, string[]>;
  traits: Record<string, string[]>;
  catalogConcepts: string[];
  errors: OntologyLintIssue[];
  warnings: OntologyLintIssue[];
  counts: { errors: number; warnings: number; byCode: Record<string, number> };
}

/** Neutral empty result for FakeLogosBridge / stubs. */
export function emptyOntologyLintResult(
  over: Partial<OntologyLintResult> = {},
): OntologyLintResult {
  return {
    ok: true,
    plantParent: "Engine",
    plantTaxa: [],
    plantTaxaCount: 0,
    families: {},
    traits: {},
    catalogConcepts: [],
    errors: [],
    warnings: [],
    counts: { errors: 0, warnings: 0, byCode: {} },
    ...over,
  };
}

/** Combined document `logos ontology-lint - --json` reads. */
export function toOntologyLintFile(input: OntologyLintInput): Record<string, unknown> {
  const cfg = input.config;
  return compact({
    ontology: input.ontology,
    catalog: input.catalog?.map((e) =>
      compact({
        id: e.id,
        dlConcept: e.dlConcept,
        family: e.family,
      }),
    ),
    config: cfg
      ? compact({
          plant_parent: cfg.plantParent,
          trait_classes: cfg.traitClasses,
          trait_axes: cfg.traitAxes,
          families: cfg.families,
          seeded_outside_catalog: cfg.seededOutsideCatalog,
          min_plant_taxa: cfg.minPlantTaxa,
        })
      : undefined,
  });
}

function issueFromWire(raw: unknown): OntologyLintIssue {
  const r = asWireObject(raw);
  return {
    code: String(r.code ?? ""),
    message: String(r.message ?? ""),
    taxon: typeof r.taxon === "string" ? r.taxon : undefined,
    families: Array.isArray(r.families) ? r.families.map(String) : undefined,
    axis: Array.isArray(r.axis) ? r.axis.map(String) : undefined,
    catalogFamily: typeof r.catalog_family === "string" ? r.catalog_family : undefined,
    ontologyFamilies: Array.isArray(r.ontology_families)
      ? r.ontology_families.map(String)
      : undefined,
    id: typeof r.id === "string" ? r.id : undefined,
    count: typeof r.count === "number" ? r.count : undefined,
    min: typeof r.min === "number" ? r.min : undefined,
  };
}

export function ontologyLintResultFromWire(raw: unknown): OntologyLintResult {
  const r = asWireObject(raw);
  const counts = asWireObject(r.counts);
  const byCodeRaw = asWireObject(counts.by_code);
  const byCode: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCodeRaw)) {
    if (typeof v === "number") byCode[k] = v;
  }
  return {
    ok: r.ok === true,
    plantParent: typeof r.plant_parent === "string" ? r.plant_parent : "Engine",
    plantTaxa: asWireArray(r.plant_taxa).map(String),
    plantTaxaCount: typeof r.plant_taxa_count === "number" ? r.plant_taxa_count : 0,
    families: asWireObject(r.families) as Record<string, string[]>,
    traits: asWireObject(r.traits) as Record<string, string[]>,
    catalogConcepts: asWireArray(r.catalog_concepts).map(String),
    errors: asWireArray(r.errors).map(issueFromWire),
    warnings: asWireArray(r.warnings).map(issueFromWire),
    counts: {
      errors: typeof counts.errors === "number" ? counts.errors : 0,
      warnings: typeof counts.warnings === "number" ? counts.warnings : 0,
      byCode,
    },
  };
}

// --- revise (ontology coherence gatekeeper) ----------------------------------

export interface ReviseInput {
  base: Record<string, unknown>;
  revision: Record<string, unknown>;
}

export interface ReviseResult {
  accept: boolean;
  conflicts: string[];
  wellFormednessIssues: string[];
  consistent: boolean | null;
  coherent: boolean;
  unsatisfiable: string[];
  newUnsatisfiable: string[];
  undecided: string[];
  explanation: string;
  merged: Record<string, unknown>;
}

export function toReviseFile(input: ReviseInput): Record<string, unknown> {
  return { base: input.base, revision: input.revision };
}

export function reviseResultFromWire(raw: unknown): ReviseResult {
  const r = asWireObject(raw);
  return {
    accept: r.accept === true,
    conflicts: asWireArray(r.conflicts).map(String),
    wellFormednessIssues: asWireArray(r.wellFormednessIssues).map(String),
    consistent: typeof r.consistent === "boolean" ? r.consistent : null,
    coherent: r.coherent === true,
    unsatisfiable: asWireArray(r.unsatisfiable).map(String),
    newUnsatisfiable: asWireArray(r.newUnsatisfiable).map(String),
    undecided: asWireArray(r.undecided).map(String),
    explanation: typeof r.explanation === "string" ? r.explanation : String(r.explanation ?? ""),
    merged: asWireObject(r.merged),
  };
}

// --- verbalize (NL round-trip fidelity) --------------------------------------

export interface VerbalizeInput {
  formula?: string;
  controlledEnglish?: string;
}

export interface VerbalizeResult {
  formula: string;
  fluent: string;
  controlled: string | null;
  controllable: boolean;
  parsedBack: string | null;
  roundtripEquivalent: boolean | null;
  faithful: boolean;
  error?: string;
}

export function toVerbalizeArgs(input: VerbalizeInput): string[] {
  if (input.controlledEnglish !== undefined) {
    return ["verbalize", input.controlledEnglish, "--ce", "--json"];
  }
  return ["verbalize", input.formula ?? "", "--json"];
}

export function verbalizeResultFromWire(raw: unknown): VerbalizeResult {
  const r = asWireObject(raw);
  if (typeof r.error === "string" && r.fluent === undefined) {
    return {
      formula: "",
      fluent: "",
      controlled: null,
      controllable: false,
      parsedBack: null,
      roundtripEquivalent: null,
      faithful: false,
      error: r.error,
    };
  }
  return {
    formula: typeof r.formula === "string" ? r.formula : String(r.formula ?? ""),
    fluent: typeof r.fluent === "string" ? r.fluent : String(r.fluent ?? ""),
    controlled: typeof r.controlled === "string" ? r.controlled : null,
    controllable: r.controllable === true,
    parsedBack: typeof r.parsed_back === "string" ? r.parsed_back : null,
    roundtripEquivalent:
      typeof r.roundtrip_equivalent === "boolean" ? r.roundtrip_equivalent : null,
    faithful: r.faithful === true,
  };
}

// --- reason (defeasible conflict resolution) ---------------------------------

export interface ReasonRule {
  id: string;
  if: string;
  then: string;
  priority?: number;
  defeatIf?: string;
}

export interface ReasonInput {
  rules: ReasonRule[];
  facts: Array<{ id?: string; formula: string; confidence?: number }>;
  ontology?: Record<string, unknown>;
  maxRounds?: number;
  realize?: boolean;
  view?: string;
  scope?: Record<string, unknown> | true | "auto";
}

export interface ReasonResolution {
  winner: string;
  loser: string;
  basis: "priority" | "specificity";
  suppressed: string;
}

export interface ReasonRealized {
  individual: string;
  class: string;
  confidence: number;
  facts: string[];
}

export interface ReasonResult {
  derived: Array<{ formula: string; ruleId: string; facts: string[]; confidence: number }>;
  resolutions: ReasonResolution[];
  unresolved: string[];
  defeated: string[];
  unsafe: string[];
  realized: ReasonRealized[];
  rounds: number;
  fixpoint: boolean;
  realizationNote: string | null;
  realizationUndecided: Array<{ individual: string; class: string }>;
  limits?: RealizeLimits;
  scopeMeta?: RealizeScopeMeta;
}

/** Build the LOGOS objects array (`logos reason <file> --json` reads). */
export function toReasonFile(input: ReasonInput): unknown[] {
  const rules = input.rules.map((r) => ({
    id: r.id,
    kind: "Rule",
    if: r.if,
    then: r.then,
    priority: r.priority ?? 0,
    logic: "FOL⊗ML",
    level: "L2",
    ...(r.defeatIf ? { defeat_if: r.defeatIf } : {}),
  }));
  const facts = input.facts.map((f, i) => ({
    id: f.id ?? `F_${i}`,
    kind: "Claim",
    formula: f.formula,
    logic: "FOL",
    status: "observed",
    confidence: f.confidence ?? 0.9,
    level: "L1",
    provenance: { derived_from: ["P_agent"] },
  }));
  const ontology = input.ontology ? [{ id: "ontology", kind: "Ontology", ...input.ontology }] : [];
  return [...ontology, ...rules, ...facts];
}

export function emptyReasonResult(): ReasonResult {
  return {
    derived: [],
    resolutions: [],
    unresolved: [],
    defeated: [],
    unsafe: [],
    realized: [],
    rounds: 1,
    fixpoint: true,
    realizationNote: null,
    realizationUndecided: [],
  };
}

export function reasonResultFromWire(raw: unknown): ReasonResult {
  const r = asWireObject(raw);
  const limits = r.limits != null ? asWireObject(r.limits) : null;
  const scope = r.scope != null ? asWireObject(r.scope) : null;
  return {
    derived: asWireArray(r.derived).map((item) => {
      const c = asWireObject(item);
      return {
        formula: String(c.formula ?? ""),
        ruleId: String(c.rule_id ?? ""),
        facts: asWireArray(c.facts).map(String),
        confidence: typeof c.confidence === "number" ? c.confidence : 0,
      };
    }),
    resolutions: asWireArray(r.resolutions).map((item) => {
      const x = asWireObject(item);
      return {
        winner: String(x.winner ?? ""),
        loser: String(x.loser ?? ""),
        basis: x.basis === "specificity" ? ("specificity" as const) : ("priority" as const),
        suppressed: String(x.suppressed ?? ""),
      };
    }),
    unresolved: asWireArray(r.unresolved).map(String),
    defeated: asWireArray(r.defeated).map(String),
    unsafe: asWireArray(r.unsafe).map(String),
    realized: asWireArray(r.realized).map((item) => {
      const x = asWireObject(item);
      return {
        individual: String(x.individual ?? ""),
        class: String(x.class ?? ""),
        confidence: typeof x.confidence === "number" ? x.confidence : 0,
        facts: asWireArray(x.facts).map(String),
      };
    }),
    rounds: typeof r.rounds === "number" ? r.rounds : 1,
    fixpoint: typeof r.fixpoint === "boolean" ? r.fixpoint : true,
    realizationNote: typeof r.realization_note === "string" ? r.realization_note : null,
    realizationUndecided: asWireArray(r.realization_undecided).map((item) => {
      const u = asWireObject(item);
      return {
        individual: String(u.individual ?? ""),
        class: String(u.class ?? ""),
      };
    }),
    limits: limits
      ? {
          droppedAxioms: limits.dropped_axioms === true,
          nodeCap: limits.node_cap === true,
        }
      : undefined,
    scopeMeta: scope
      ? {
          projected: scope.projected === true,
          classes: typeof scope.classes === "number" ? scope.classes : undefined,
          roles: typeof scope.roles === "number" ? scope.roles : undefined,
          subtypes: typeof scope.subtypes === "number" ? scope.subtypes : undefined,
          gci: typeof scope.gci === "number" ? scope.gci : undefined,
          disjoint: typeof scope.disjoint === "number" ? scope.disjoint : undefined,
          fullClasses: typeof scope.full_classes === "number" ? scope.full_classes : undefined,
          fullRoles: typeof scope.full_roles === "number" ? scope.full_roles : undefined,
          auto: scope.auto === true,
        }
      : undefined,
  };
}

// --- forecast (Prediction: project a timeseries toward a threshold) ----------

export interface ForecastInput {
  series: Array<{ t?: string | number; timestamp?: string; value: number }>;
  threshold: number;
}

export interface ForecastResult {
  n: number;
  threshold: number;
  current: number | null;
  slopePerHour: number | null;
  intercept: number | null;
  rSquared: number | null;
  direction: "falling" | "rising" | "flat" | "unknown";
  willCross: boolean;
  hoursToThreshold: number | null;
  crossAtHours: number | null;
}

export function toForecastFile(input: ForecastInput): Record<string, unknown> {
  return { threshold: input.threshold, series: input.series };
}

export function forecastResultFromWire(raw: unknown): ForecastResult {
  const r = asWireObject(raw);
  const direction = r.direction;
  return {
    n: typeof r.n === "number" ? r.n : 0,
    threshold: typeof r.threshold === "number" ? r.threshold : Number(r.threshold ?? 0),
    current: typeof r.current === "number" ? r.current : null,
    slopePerHour: typeof r.slope_per_hour === "number" ? r.slope_per_hour : null,
    intercept: typeof r.intercept === "number" ? r.intercept : null,
    rSquared: typeof r.r_squared === "number" ? r.r_squared : null,
    direction:
      direction === "falling" ||
      direction === "rising" ||
      direction === "flat" ||
      direction === "unknown"
        ? direction
        : "unknown",
    willCross: r.will_cross === true,
    hoursToThreshold: typeof r.hours_to_threshold === "number" ? r.hours_to_threshold : null,
    crossAtHours: typeof r.cross_at_hours === "number" ? r.cross_at_hours : null,
  };
}

// --- strategize (game-theoretic solution concepts + honest degeneracy) -------

export interface StrategizeInput {
  decision?: { actions: string[]; states: string[]; payoffs: number[][]; hurwiczAlpha?: number };
  cooperative?: { players: string[]; coalitions: Array<{ members: string[]; value: number }> };
}

export interface StrategizeResult {
  decision: DecisionAnalysis | null;
  cooperative: CooperativeAnalysis | null;
  degeneracy: string[];
  escalate: boolean;
}

export function toStrategizeFile(input: StrategizeInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.decision) {
    out.decision = {
      actions: input.decision.actions,
      states: input.decision.states,
      payoffs: input.decision.payoffs,
      hurwicz_alpha: input.decision.hurwiczAlpha ?? 0.5,
    };
  }
  if (input.cooperative) {
    out.cooperative = {
      players: input.cooperative.players,
      coalitions: input.cooperative.coalitions.map((c) => ({ members: c.members, value: c.value })),
    };
  }
  return out;
}

function criterionFromWire(raw: unknown): CriterionResult["criterion"] {
  if (raw === "maximin" || raw === "hurwicz" || raw === "laplace" || raw === "minimax_regret") {
    return raw;
  }
  // Tolerate hyphenated wire spelling if an older engine ever emits it.
  if (raw === "minimax-regret") return "minimax_regret";
  return "laplace";
}

export function strategizeResultFromWire(raw: unknown, input: StrategizeInput): StrategizeResult {
  const r = asWireObject(raw);

  let decision: DecisionAnalysis | null = null;
  if (r.decision && input.decision) {
    const d = asWireObject(r.decision);
    const consensus = asWireObject(d.consensus_pick);
    decision = {
      matrix: {
        actions: input.decision.actions,
        states: input.decision.states,
        payoffs: input.decision.payoffs,
      },
      criteria: asWireArray(d.criteria).map((item) => {
        const c = asWireObject(item);
        return {
          criterion: criterionFromWire(c.criterion),
          metric: asWireArray(c.metric).map((n) => (typeof n === "number" ? n : Number(n))),
          higherIsBetter: c.higher_is_better === true,
          bestActions: asWireArray(c.best_actions).map((n) =>
            typeof n === "number" ? n : Number(n),
          ),
          rationale: typeof c.rationale === "string" ? c.rationale : String(c.rationale ?? ""),
        };
      }),
      dominated: asWireArray(d.dominated).map((n) => (typeof n === "number" ? n : Number(n))),
      consensusPick: {
        action: typeof consensus.action === "number" ? consensus.action : 0,
        agreement: typeof consensus.agreement === "number" ? consensus.agreement : 0,
        total: typeof consensus.total === "number" ? consensus.total : 0,
      },
      unanimous: d.unanimous === true,
      hurwiczAlpha: typeof d.hurwicz_alpha === "number" ? d.hurwicz_alpha : 0.5,
    };
  }

  let cooperative: CooperativeAnalysis | null = null;
  if (r.cooperative && input.cooperative) {
    const c = asWireObject(r.cooperative);
    const players = asWireArray(c.players).map(String);
    const playersOrInput = players.length > 0 ? players : input.cooperative.players;
    const shapleyList = asWireArray(c.shapley).map((n) => (typeof n === "number" ? n : Number(n)));
    const shapley: Record<string, number> = {};
    playersOrInput.forEach((p, i) => {
      shapley[p] = shapleyList[i] ?? 0;
    });
    cooperative = {
      players: playersOrInput,
      grandValue: typeof c.grand_value === "number" ? c.grand_value : 0,
      shapley,
      superadditive: c.superadditive === true,
      blockingCoalitions: asWireArray(c.blocking_coalitions).map((item) => {
        const b = asWireObject(item);
        return {
          members: asWireArray(b.members).map((i) => {
            const idx = typeof i === "number" ? i : Number(i);
            return playersOrInput[idx] ?? String(i);
          }),
          value: typeof b.value === "number" ? b.value : Number(b.value ?? 0),
          shapleyShare:
            typeof b.shapley_share === "number" ? b.shapley_share : Number(b.shapley_share ?? 0),
        };
      }),
      shapleyInCore: c.shapley_in_core === true,
    };
  }

  return {
    decision,
    cooperative,
    degeneracy: asWireArray(r.degeneracy).map(String),
    escalate: r.escalate === true,
  };
}

/** Parse `solve --json` stdout into a DiagnosticSolution, or throw LogosProtocolError. */
export function solutionFromWire(raw: unknown): DiagnosticSolution {
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) {
    throw new LogosProtocolError("LOGOS output missing expected fields (no 'kind').", { raw });
  }
  const r = asWireObject(raw);
  const kind = r.kind;
  if (typeof kind !== "string") {
    throw new LogosProtocolError("LOGOS output missing expected fields (no 'kind').", { raw });
  }
  return {
    problemId:
      typeof r.problem_id === "string"
        ? fromLogosProblemId(r.problem_id)
        : String(r.problem_id ?? ""),
    types: asWireArray(r.types).map(String) as DiagnosticSolution["types"],
    pattern: typeof r.pattern === "string" ? r.pattern : String(r.pattern ?? ""),
    ranked: asWireArray(r.ranked).map((item) => {
      const x = asWireObject(item);
      return {
        action: actionFromWire(x.action),
        score: typeof x.score === "number" ? x.score : Number(x.score ?? 0),
      };
    }),
    disqualified: asWireArray(r.disqualified).map((item) => {
      const x = asWireObject(item);
      return {
        actionId: String(x.action_id ?? ""),
        violatedConstraints: asWireArray(x.violated_constraints).map(String),
      };
    }),
    recommended: typeof r.recommended === "string" || r.recommended === null ? r.recommended : null,
    kind: kind as DiagnosticSolution["kind"],
    rationale: typeof r.rationale === "string" ? r.rationale : String(r.rationale ?? ""),
    confidence: typeof r.confidence === "number" ? r.confidence : null,
    certainty: typeof r.certainty === "string" ? r.certainty : String(r.certainty ?? ""),
    antiPatterns: asWireArray(r.anti_patterns).map(String),
    escalations: asWireArray(r.escalations).map(String),
    counterfactuals: asWireArray(r.counterfactuals).map((item) => {
      const c = asWireObject(item);
      return {
        actionId: String(c.action_id ?? ""),
        score: typeof c.score === "number" ? c.score : Number(c.score ?? 0),
        isTop: c.is_top === true,
        rank: typeof c.rank === "number" ? c.rank : Number(c.rank ?? 0),
        ...(Array.isArray(c.flips) ? { flips: c.flips } : {}),
        ...(Array.isArray(c.robustness) ? { robustness: c.robustness } : {}),
      };
    }),
  };
}
