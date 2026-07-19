/**
 * The LOGOS wire contract and the camelCase <-> snake_case mapping. This is the
 * ONE place that knows LOGOS's `problem.schema.json` / `solve --json` field
 * names — the seam. Everything else in auto-architect stays camelCase.
 *
 * Adapted from @garden/logos-bridge/types.ts: `GardenSolution` -> `DiagnosticSolution`,
 * `@garden/semantic-types` -> `@auto/semantic-types`. The wire contract itself
 * (LOGOS's actual protocol) is unchanged — the engine is domain-agnostic.
 */
import type {
  CandidateAction,
  CausalModel,
  DesiredStateSpec,
  DiagnosticSolution,
  ProblemStatement,
  ProblemType,
  GapType,
} from "@auto/semantic-types";
import type { CooperativeAnalysis, CriterionResult, DecisionAnalysis } from "@auto/game-theory";
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

/** Read protocol metadata when present; missing keys are fine (Fake / old fixtures). */
export function readWireMeta(raw: unknown): LogosWireMeta {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
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
  if (meta.engineVersion !== undefined && compareEngineVersion(meta.engineVersion, LOGOS_MIN_ENGINE_VERSION) < 0) {
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
    id: typeof input.id === "string" && input.id.length > 0 ? toLogosProblemId(input.id) : undefined,
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

interface WireAction {
  id: string;
  description?: string;
  impact?: number;
  confidence?: number;
  info_gain?: number;
  cost?: number;
  risk?: number;
  reversibility?: number;
  alignment?: number;
  tags?: string[];
  violates?: string[];
  first_step?: string | null;
  stop_conditions?: string | null;
}

function actionFromWire(a: WireAction): CandidateAction {
  return {
    id: a.id,
    description: a.description,
    impact: a.impact,
    confidence: a.confidence,
    infoGain: a.info_gain,
    cost: a.cost,
    risk: a.risk,
    reversibility: a.reversibility,
    alignment: a.alignment,
    tags: a.tags,
    violates: a.violates,
    firstStep: a.first_step ?? undefined,
    stopConditions: a.stop_conditions ?? undefined,
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
  const r = (raw ?? {}) as Record<string, unknown>;
  const scope = (r.scope ?? null) as Record<string, unknown> | null;
  const limits = (r.limits ?? null) as Record<string, unknown> | null;
  return {
    individual: String(r.individual ?? ""),
    member: (r.member as string[]) ?? [],
    mostSpecific: (r.most_specific as string[]) ?? [],
    undecided: Array.isArray(r.undecided) ? (r.undecided as string[]) : [],
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
export function emptyOntologyLintResult(over: Partial<OntologyLintResult> = {}): OntologyLintResult {
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
  const r = (raw ?? {}) as Record<string, any>;
  return {
    code: String(r.code ?? ""),
    message: String(r.message ?? ""),
    taxon: typeof r.taxon === "string" ? r.taxon : undefined,
    families: Array.isArray(r.families) ? r.families : undefined,
    axis: Array.isArray(r.axis) ? r.axis : undefined,
    catalogFamily: typeof r.catalog_family === "string" ? r.catalog_family : undefined,
    ontologyFamilies: Array.isArray(r.ontology_families) ? r.ontology_families : undefined,
    id: typeof r.id === "string" ? r.id : undefined,
    count: typeof r.count === "number" ? r.count : undefined,
    min: typeof r.min === "number" ? r.min : undefined,
  };
}

export function ontologyLintResultFromWire(raw: unknown): OntologyLintResult {
  const r = (raw ?? {}) as Record<string, any>;
  const counts = (r.counts ?? {}) as Record<string, any>;
  return {
    ok: r.ok === true,
    plantParent: typeof r.plant_parent === "string" ? r.plant_parent : "Engine",
    plantTaxa: Array.isArray(r.plant_taxa) ? r.plant_taxa : [],
    plantTaxaCount: typeof r.plant_taxa_count === "number" ? r.plant_taxa_count : 0,
    families: (r.families ?? {}) as Record<string, string[]>,
    traits: (r.traits ?? {}) as Record<string, string[]>,
    catalogConcepts: Array.isArray(r.catalog_concepts) ? r.catalog_concepts : [],
    errors: (r.errors ?? []).map(issueFromWire),
    warnings: (r.warnings ?? []).map(issueFromWire),
    counts: {
      errors: typeof counts.errors === "number" ? counts.errors : 0,
      warnings: typeof counts.warnings === "number" ? counts.warnings : 0,
      byCode: (counts.by_code ?? {}) as Record<string, number>,
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
  const r = (raw ?? {}) as Record<string, any>;
  return {
    accept: r.accept === true,
    conflicts: r.conflicts ?? [],
    wellFormednessIssues: r.wellFormednessIssues ?? [],
    consistent: r.consistent ?? null,
    coherent: r.coherent === true,
    unsatisfiable: r.unsatisfiable ?? [],
    newUnsatisfiable: r.newUnsatisfiable ?? [],
    undecided: r.undecided ?? [],
    explanation: r.explanation ?? "",
    merged: r.merged ?? {},
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
  const r = (raw ?? {}) as Record<string, any>;
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
    formula: r.formula ?? "",
    fluent: r.fluent ?? "",
    controlled: r.controlled ?? null,
    controllable: r.controllable === true,
    parsedBack: r.parsed_back ?? null,
    roundtripEquivalent: r.roundtrip_equivalent ?? null,
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
  const r = (raw ?? {}) as Record<string, any>;
  const limits = (r.limits ?? null) as Record<string, unknown> | null;
  const scope = (r.scope ?? null) as Record<string, unknown> | null;
  return {
    derived: (r.derived ?? []).map((c: { formula: string; rule_id: string; facts: string[]; confidence: number }) => ({
      formula: c.formula,
      ruleId: c.rule_id,
      facts: c.facts ?? [],
      confidence: c.confidence,
    })),
    resolutions: r.resolutions ?? [],
    unresolved: r.unresolved ?? [],
    defeated: r.defeated ?? [],
    unsafe: r.unsafe ?? [],
    realized: r.realized ?? [],
    rounds: typeof r.rounds === "number" ? r.rounds : 1,
    fixpoint: typeof r.fixpoint === "boolean" ? r.fixpoint : true,
    realizationNote: r.realization_note ?? null,
    realizationUndecided: Array.isArray(r.realization_undecided)
      ? r.realization_undecided.map((u: { individual?: string; class?: string }) => ({
          individual: String(u.individual ?? ""),
          class: String(u.class ?? ""),
        }))
      : [],
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
  const r = (raw ?? {}) as Record<string, any>;
  return {
    n: r.n ?? 0,
    threshold: r.threshold,
    current: r.current ?? null,
    slopePerHour: r.slope_per_hour ?? null,
    intercept: r.intercept ?? null,
    rSquared: r.r_squared ?? null,
    direction: r.direction ?? "unknown",
    willCross: r.will_cross === true,
    hoursToThreshold: r.hours_to_threshold ?? null,
    crossAtHours: r.cross_at_hours ?? null,
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

interface WireCriterion {
  criterion: CriterionResult["criterion"];
  metric: number[];
  higher_is_better: boolean;
  best_actions: number[];
  rationale: string;
}

export function strategizeResultFromWire(raw: unknown, input: StrategizeInput): StrategizeResult {
  const r = (raw ?? {}) as Record<string, any>;

  let decision: DecisionAnalysis | null = null;
  if (r.decision && input.decision) {
    const d = r.decision as Record<string, any>;
    decision = {
      matrix: {
        actions: input.decision.actions,
        states: input.decision.states,
        payoffs: input.decision.payoffs,
      },
      criteria: (d.criteria ?? []).map((c: WireCriterion) => ({
        criterion: c.criterion,
        metric: c.metric ?? [],
        higherIsBetter: c.higher_is_better === true,
        bestActions: c.best_actions ?? [],
        rationale: c.rationale ?? "",
      })),
      dominated: d.dominated ?? [],
      consensusPick: {
        action: d.consensus_pick?.action ?? 0,
        agreement: d.consensus_pick?.agreement ?? 0,
        total: d.consensus_pick?.total ?? 0,
      },
      unanimous: d.unanimous === true,
      hurwiczAlpha: d.hurwicz_alpha ?? 0.5,
    };
  }

  let cooperative: CooperativeAnalysis | null = null;
  if (r.cooperative && input.cooperative) {
    const c = r.cooperative as Record<string, any>;
    const players: string[] = c.players ?? input.cooperative.players;
    const shapleyList: number[] = c.shapley ?? [];
    const shapley: Record<string, number> = {};
    players.forEach((p, i) => {
      shapley[p] = shapleyList[i] ?? 0;
    });
    cooperative = {
      players,
      grandValue: c.grand_value ?? 0,
      shapley,
      superadditive: c.superadditive === true,
      blockingCoalitions: (c.blocking_coalitions ?? []).map(
        (b: { members: number[]; value: number; shapley_share: number }) => ({
          members: (b.members ?? []).map((i) => players[i] ?? String(i)),
          value: b.value,
          shapleyShare: b.shapley_share,
        }),
      ),
      shapleyInCore: c.shapley_in_core === true,
    };
  }

  return {
    decision,
    cooperative,
    degeneracy: r.degeneracy ?? [],
    escalate: r.escalate === true,
  };
}

/** Parse `solve --json` stdout into a DiagnosticSolution, or throw LogosProtocolError. */
export function solutionFromWire(raw: unknown): DiagnosticSolution {
  if (typeof raw !== "object" || raw === null || !("kind" in raw)) {
    throw new LogosProtocolError("LOGOS output missing expected fields (no 'kind').", { raw });
  }
  const r = raw as Record<string, any>;
  return {
    problemId: typeof r.problem_id === "string" ? fromLogosProblemId(r.problem_id) : r.problem_id,
    types: r.types ?? [],
    pattern: r.pattern ?? "",
    ranked: (r.ranked ?? []).map((x: { action: WireAction; score: number }) => ({
      action: actionFromWire(x.action),
      score: x.score,
    })),
    disqualified: (r.disqualified ?? []).map((x: { action_id: string; violated_constraints: string[] }) => ({
      actionId: x.action_id,
      violatedConstraints: x.violated_constraints ?? [],
    })),
    recommended: r.recommended ?? null,
    kind: r.kind,
    rationale: r.rationale ?? "",
    confidence: r.confidence ?? null,
    certainty: r.certainty ?? "",
    antiPatterns: r.anti_patterns ?? [],
    escalations: r.escalations ?? [],
    counterfactuals: (r.counterfactuals ?? []).map(
      (c: {
        action_id: string;
        score: number;
        is_top: boolean;
        rank: number;
        flips?: unknown[];
        robustness?: unknown[];
      }) => ({
        actionId: c.action_id,
        score: c.score,
        isTop: c.is_top,
        rank: c.rank,
        ...(c.flips ? { flips: c.flips } : {}),
        ...(c.robustness ? { robustness: c.robustness } : {}),
      }),
    ),
  };
}
