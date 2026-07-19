/**
 * A deterministic, Python-free bridge for tests. It is a *simplified* stand-in:
 * it applies LOGOS's priority formula, constraint disqualification, and the
 * core Action Rule order (stabilize → clarify-values → measure-first → act).
 * It does NOT replicate every override (counterfactuals, full type
 * classification, anti-patterns). Pass a custom `responder` for scenario-
 * specific canned solutions.
 *
 * Ported from @garden/logos-bridge/fake.ts (GardenSolution -> DiagnosticSolution).
 * Not an edge-hardware substitute: production and obd-gateway integration
 * tests always use the real bridge (`createLogosBridge`); Fake is unit-tests-only.
 */

import {
  analyzeCooperative,
  analyzeDecision,
  type CharacteristicFunction,
} from "@auto/game-theory";
import type {
  CandidateAction,
  DiagnosticSolution,
  ProblemType,
  RankedAction,
} from "@auto/semantic-types";
import type { LogosBridge } from "./bridge.ts";
import type {
  ForecastInput,
  ForecastResult,
  LogosProblemInput,
  OntologyLintInput,
  OntologyLintResult,
  RealizeInput,
  RealizeResult,
  ReasonInput,
  ReasonResult,
  ReviseInput,
  ReviseResult,
  StrategizeInput,
  StrategizeResult,
  VerbalizeInput,
  VerbalizeResult,
} from "./types.ts";
import { emptyOntologyLintResult, emptyReasonResult } from "./types.ts";

const EPS = 0.05;

function priority(a: CandidateAction): number {
  const impact = a.impact ?? 0;
  const confidence = a.confidence ?? 0;
  const infoGain = a.infoGain ?? 0;
  const cost = a.cost ?? 1;
  const risk = a.risk ?? 0.5;
  const reversibility = a.reversibility ?? 0.5;
  const alignment = a.alignment ?? 1;
  const num =
    Math.max(impact, 0) *
    Math.max(confidence, 0) *
    Math.max(infoGain, EPS) *
    Math.max(alignment, EPS);
  const den = Math.max(cost, EPS) * Math.max(risk, EPS) * Math.max(1 - reversibility, EPS);
  return num / den;
}

function certaintyLabel(c: number): string {
  if (c >= 0.95) return "near certain — act confidently, but stay awake";
  if (c >= 0.8) return "strongly supported — act if stakes allow";
  if (c >= 0.6) return "likely — use cautiously";
  if (c >= 0.4) return "plausible — test";
  if (c >= 0.2) return "weak possibility — investigate";
  return "wild guess — do not rely on it";
}

function hasTag(a: CandidateAction, tags: Set<string>): boolean {
  return (a.tags ?? []).some((t) => tags.has(t));
}

function pickTagged(ranked: RankedAction[], tags: Set<string>): CandidateAction | undefined {
  for (const r of ranked) {
    if (hasTag(r.action, tags)) return r.action;
  }
  return undefined;
}

function problemTypes(input: LogosProblemInput): ProblemType[] {
  if (Array.isArray(input.problemType)) return input.problemType;
  if (input.problemType) return [input.problemType];
  return ["Diagnostic"];
}

/**
 * Mirror of LOGOS `solve.py` Action Rule order (stabilize → clarify → measure → act).
 * Simplified: no full type classification or anti-pattern warnings.
 */
function defaultResponder(input: LogosProblemInput): DiagnosticSolution {
  const nonNeg = new Set(input.desiredState?.nonNegotiableConstraints ?? []);
  const actions = input.actions ?? [];
  const types = problemTypes(input);

  const disqualified = actions
    .map((a) => ({ a, bad: (a.violates ?? []).filter((v) => nonNeg.has(v)) }))
    .filter((x) => x.bad.length > 0)
    .map((x) => ({ actionId: x.a.id, violatedConstraints: x.bad }));

  const live = actions.filter((a) => !(a.violates ?? []).some((v) => nonNeg.has(v)));
  const ranked: RankedAction[] = live
    .map((a) => ({ action: a, score: priority(a) }))
    .sort((x, y) => y.score - x.score);

  const top = ranked[0]?.action;
  const urgency = (input.statement?.urgency ?? "").toLowerCase();
  const gap = input.gapType;
  const dangerous = types.includes("Stability") || urgency === "critical";
  const goalUnclear =
    types.includes("Moral") || gap === "value" || !input.desiredState?.successCriteria;
  const poorlyUnderstood =
    gap === "causal" ||
    gap === "measurement" ||
    gap === "knowledge" ||
    (Boolean(input.causalModel?.symptoms?.length) && !input.causalModel?.rootCauses?.length);

  let recommended: string | null = null;
  let kind: DiagnosticSolution["kind"] = "none";
  let rationale: string;
  const escalations: string[] = [];

  if (dangerous) {
    const stab = pickTagged(ranked, new Set(["stabilize", "safety"]));
    if (stab) {
      recommended = stab.id;
      kind = "stabilize-first";
      rationale = "the situation is dangerous — stabilize before optimizing (FakeLogosBridge)";
    } else {
      recommended = null;
      kind = "escalate";
      rationale =
        "dangerous situation with no stabilizing action available — escalate (FakeLogosBridge)";
      escalations.push("stabilize gate: no safe stabilizing action on hand");
    }
  } else if (goalUnclear) {
    recommended = null;
    kind = "clarify-values";
    rationale =
      "the goal/values are unclear — clarify what success means before choosing means (FakeLogosBridge)";
    escalations.push("value gate: success criteria or values undefined");
  } else if (poorlyUnderstood) {
    const probe = pickTagged(ranked, new Set(["measure", "diagnostic"])) ?? top;
    recommended = probe?.id ?? null;
    kind = "measure-first";
    rationale =
      "the system is poorly understood — run the cheapest informative test before intervening (FakeLogosBridge)";
  } else if (top) {
    recommended = top.id;
    kind = "act";
    rationale = "highest impact-to-risk ratio among viable actions (FakeLogosBridge)";
  } else {
    recommended = null;
    kind = "none";
    rationale = "no viable action (FakeLogosBridge)";
  }

  const chosen = ranked.find((r) => r.action.id === recommended)?.action ?? top;
  const confidence = recommended ? (chosen?.confidence ?? null) : null;

  return {
    problemId: input.id,
    types,
    pattern: "options → criteria → evidence → tradeoffs → decision",
    ranked,
    disqualified,
    recommended,
    kind,
    rationale,
    confidence,
    certainty: confidence !== null ? certaintyLabel(confidence) : "n/a",
    antiPatterns: [],
    escalations,
  };
}

function defaultReviser(input: ReviseInput): ReviseResult {
  return {
    accept: true,
    conflicts: [],
    wellFormednessIssues: [],
    consistent: true,
    coherent: true,
    unsatisfiable: [],
    newUnsatisfiable: [],
    undecided: [],
    explanation: "Revision is coherent and may be adopted. (FakeLogosBridge)",
    merged: { ...input.base, ...input.revision },
  };
}

function defaultForecaster(input: ForecastInput): ForecastResult {
  const current = input.series.length ? input.series[input.series.length - 1]!.value : null;
  return {
    n: input.series.length,
    threshold: input.threshold,
    current,
    slopePerHour: null,
    intercept: null,
    rSquared: null,
    direction: "unknown",
    willCross: false,
    hoursToThreshold: null,
    crossAtHours: null,
  };
}

function defaultReasoner(_input: ReasonInput): ReasonResult {
  return emptyReasonResult();
}

function defaultVerbalizer(input: VerbalizeInput): VerbalizeResult {
  const text = input.formula ?? input.controlledEnglish ?? "";
  return {
    formula: text,
    fluent: text,
    controlled: text,
    controllable: true,
    parsedBack: text,
    roundtripEquivalent: true,
    faithful: true,
  };
}

function defaultStrategizer(input: StrategizeInput): StrategizeResult {
  const degeneracy: string[] = [];
  let escalate = false;

  const decision = input.decision
    ? analyzeDecision(
        {
          actions: input.decision.actions,
          states: input.decision.states,
          payoffs: input.decision.payoffs,
        },
        { hurwiczAlpha: input.decision.hurwiczAlpha ?? 0.5 },
      )
    : null;
  if (decision && input.decision) {
    const undominated = input.decision.actions.length - decision.dominated.length;
    if (!decision.unanimous && decision.consensusPick.agreement <= 1 && undominated > 1) {
      degeneracy.push(
        "decision criteria disagree with no majority and no dominant action; the choice is not well-determined",
      );
      escalate = true;
    }
  }

  let cooperative = null;
  if (input.cooperative) {
    const table = new Map<string, number>();
    for (const c of input.cooperative.coalitions)
      table.set([...c.members].sort().join("|"), c.value);
    const v: CharacteristicFunction = (members) => table.get([...members].sort().join("|")) ?? 0;
    cooperative = analyzeCooperative(input.cooperative.players, v);
    if (!cooperative.shapleyInCore) {
      degeneracy.push(
        `core is empty for the fair (Shapley) allocation: ${cooperative.blockingCoalitions.length} coalition(s) would rationally break away`,
      );
      escalate = true;
    }
    if (!cooperative.superadditive) {
      degeneracy.push(
        "grand coalition is not superadditive: some split is worth more than staying together",
      );
    }
  }

  return { decision, cooperative, degeneracy, escalate };
}

export class FakeLogosBridge implements LogosBridge {
  constructor(
    private responder: (input: LogosProblemInput) => DiagnosticSolution = defaultResponder,
    /** Optional realize stub; defaults to "no classes provable". */
    private realizer: (input: RealizeInput) => RealizeResult = (i) => ({
      individual: i.individual,
      member: [],
      mostSpecific: [],
      undecided: [],
    }),
    private reviser: (input: ReviseInput) => ReviseResult = defaultReviser,
    private forecaster: (input: ForecastInput) => ForecastResult = defaultForecaster,
    private reasoner: (input: ReasonInput) => ReasonResult = defaultReasoner,
    private verbalizer: (input: VerbalizeInput) => VerbalizeResult = defaultVerbalizer,
    private strategizer: (input: StrategizeInput) => StrategizeResult = defaultStrategizer,
    private linter: (input: OntologyLintInput) => OntologyLintResult = () =>
      emptyOntologyLintResult(),
  ) {}

  async solve(input: LogosProblemInput): Promise<DiagnosticSolution> {
    return this.responder(input);
  }

  async realize(input: RealizeInput): Promise<RealizeResult> {
    return this.realizer(input);
  }

  async realizeMany(inputs: RealizeInput[]): Promise<RealizeResult[]> {
    return inputs.map((i) => this.realizer(i));
  }

  async revise(input: ReviseInput): Promise<ReviseResult> {
    return this.reviser(input);
  }

  async forecast(input: ForecastInput): Promise<ForecastResult> {
    return this.forecaster(input);
  }

  async reason(input: ReasonInput): Promise<ReasonResult> {
    return this.reasoner(input);
  }

  async verbalize(input: VerbalizeInput): Promise<VerbalizeResult> {
    return this.verbalizer(input);
  }

  async strategize(input: StrategizeInput): Promise<StrategizeResult> {
    return this.strategizer(input);
  }

  async ontologyLint(input: OntologyLintInput): Promise<OntologyLintResult> {
    return this.linter(input);
  }
}
