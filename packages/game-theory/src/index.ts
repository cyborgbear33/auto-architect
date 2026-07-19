/**
 * A small, pure, dependency-free game-theory core.
 *
 * Nothing here knows about vehicles or gardens — it operates on abstract
 * payoff matrices and characteristic functions. That keeps the mathematics
 * honest and testable, and means the whole module could later move behind a
 * LOGOS `strategize` primitive without changing callers. (Ported unchanged
 * from garden-architect's @garden/game-theory — this module is domain-agnostic
 * by design, which is the whole point.)
 *
 * Three families, straight out of von Neumann & Morgenstern and its lineage:
 *   1. Decision under uncertainty ("games against Nature") — Wald maximin,
 *      Savage minimax-regret, Hurwicz, Laplace. Nature is non-strategic, so a
 *      pure decision rule is the honest tool (no mixed strategies assumed).
 *   2. Two-person zero-sum — saddle points + 2x2 mixed strategies, for a genuine
 *      strategic adversary.
 *   3. Cooperative n-person — characteristic function, Shapley value, core
 *      stability (blocking coalitions). Useful here for e.g. "how should scarce
 *      shop time/budget be allocated across multiple vehicles' pending repairs?"
 */

// Strict indexed accessors (repo enables noUncheckedIndexedAccess).
const cell = (payoffs: number[][], i: number, j: number): number => (payoffs[i] as number[])[j] as number;
const rowAt = (payoffs: number[][], i: number): number[] => payoffs[i] as number[];

// ---------------------------------------------------------------------------
// 1. Decision under uncertainty (games against Nature)
// ---------------------------------------------------------------------------

export interface DecisionMatrix {
  actions: string[];
  states: string[];
  /** payoffs[a][s] = payoff of action `a` under state `s`; higher is better. */
  payoffs: number[][];
}

export type DecisionCriterion = "maximin" | "minimax_regret" | "hurwicz" | "laplace";

export interface CriterionResult {
  criterion: DecisionCriterion;
  /** The criterion's per-action metric (its natural quantity). */
  metric: number[];
  /** Whether a higher metric is preferred (false for regret). */
  higherIsBetter: boolean;
  /** Index/indices of the recommended action(s) (ties possible). */
  bestActions: number[];
  rationale: string;
}

export interface DecisionAnalysis {
  matrix: DecisionMatrix;
  criteria: CriterionResult[];
  /** Actions weakly dominated by another action (safe to prune / advise against). */
  dominated: number[];
  /** The action recommended by the most criteria (maximin breaks ties). Note this
   *  is a *consensus*, not necessarily the robust choice — see the maximin result
   *  for the worst-case-robust action. */
  consensusPick: { action: number; agreement: number; total: number };
  /** True when every criterion picks the same single action. */
  unanimous: boolean;
  hurwiczAlpha: number;
}

const min = (xs: number[]): number => Math.min(...xs);
const max = (xs: number[]): number => Math.max(...xs);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Indices where the metric attains its best value (max or min), within eps. */
function argBest(metric: number[], higherIsBetter: boolean, eps = 1e-9): number[] {
  const best = higherIsBetter ? max(metric) : min(metric);
  const out: number[] = [];
  metric.forEach((m, i) => {
    if (Math.abs(m - best) <= eps) out.push(i);
  });
  return out;
}

function assertMatrix(m: DecisionMatrix): void {
  if (m.actions.length === 0 || m.states.length === 0) throw new Error("DecisionMatrix needs >=1 action and >=1 state");
  if (m.payoffs.length !== m.actions.length) throw new Error("payoffs rows must match actions");
  for (const row of m.payoffs) {
    if (row.length !== m.states.length) throw new Error("payoffs cols must match states");
  }
}

/** Wald maximin: rank by the worst-case (minimum) payoff of each action. */
export function maximin(m: DecisionMatrix): CriterionResult {
  assertMatrix(m);
  const metric = m.payoffs.map((row) => min(row));
  return {
    criterion: "maximin",
    metric,
    higherIsBetter: true,
    bestActions: argBest(metric, true),
    rationale: "Choose the action whose worst possible outcome is least bad (pessimistic, robust).",
  };
}

/** Savage minimax-regret: rank by the worst regret vs. the best action per state. */
export function minimaxRegret(m: DecisionMatrix): CriterionResult {
  assertMatrix(m);
  const colBest = m.states.map((_, s) => max(m.payoffs.map((row) => row[s] as number)));
  const worstRegret = m.payoffs.map((row) => max(row.map((v, s) => (colBest[s] as number) - v)));
  return {
    criterion: "minimax_regret",
    metric: worstRegret,
    higherIsBetter: false,
    bestActions: argBest(worstRegret, false),
    rationale: "Minimize the largest 'I wish I'd chosen otherwise' regret across states.",
  };
}

/** Hurwicz: blend best and worst case by optimism coefficient alpha in [0,1]. */
export function hurwicz(m: DecisionMatrix, alpha: number): CriterionResult {
  assertMatrix(m);
  const a = Math.min(1, Math.max(0, alpha));
  const metric = m.payoffs.map((row) => a * max(row) + (1 - a) * min(row));
  return {
    criterion: "hurwicz",
    metric,
    higherIsBetter: true,
    bestActions: argBest(metric, true),
    rationale: `Blend best/worst case with optimism alpha=${a.toFixed(2)} (alpha=1 optimistic, 0 pessimistic).`,
  };
}

/** Laplace (insufficient reason): rank by the average payoff across states. */
export function laplace(m: DecisionMatrix): CriterionResult {
  assertMatrix(m);
  const metric = m.payoffs.map((row) => mean(row));
  return {
    criterion: "laplace",
    metric,
    higherIsBetter: true,
    bestActions: argBest(metric, true),
    rationale: "Treat all states as equally likely and maximize the average payoff.",
  };
}

/** Actions weakly dominated by some other action (>= in every state, > in one). */
export function dominatedActions(m: DecisionMatrix): number[] {
  assertMatrix(m);
  const n = m.payoffs.length;
  const s = m.states.length;
  const dominated: number[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      let geAll = true;
      let gtOne = false;
      for (let j = 0; j < s; j++) {
        const bv = cell(m.payoffs, b, j);
        const av = cell(m.payoffs, a, j);
        if (bv < av) geAll = false;
        if (bv > av) gtOne = true;
      }
      if (geAll && gtOne) {
        dominated.push(a);
        break;
      }
    }
  }
  return dominated;
}

/** Run all decision criteria and synthesize a consensus pick. */
export function analyzeDecision(m: DecisionMatrix, opts: { hurwiczAlpha?: number } = {}): DecisionAnalysis {
  const hurwiczAlpha = opts.hurwiczAlpha ?? 0.5;
  const criteria = [maximin(m), minimaxRegret(m), hurwicz(m, hurwiczAlpha), laplace(m)];

  const votes = new Array<number>(m.actions.length).fill(0);
  for (const c of criteria) {
    // A criterion "votes" for an action only when it uniquely selects it.
    if (c.bestActions.length === 1) {
      const idx = c.bestActions[0] as number;
      votes[idx] = (votes[idx] as number) + 1;
    }
  }
  const maximinPick = (criteria[0] as CriterionResult).bestActions[0] as number;
  let action = maximinPick;
  let agreement = votes[maximinPick] as number;
  for (let i = 0; i < votes.length; i++) {
    if ((votes[i] as number) > agreement) {
      agreement = votes[i] as number;
      action = i;
    }
  }
  const first = criteria[0] as CriterionResult;
  const unanimous = criteria.every((c) => c.bestActions.length === 1 && c.bestActions[0] === first.bestActions[0]);

  return {
    matrix: m,
    criteria,
    dominated: dominatedActions(m),
    consensusPick: { action, agreement, total: criteria.length },
    unanimous,
    hurwiczAlpha,
  };
}

// ---------------------------------------------------------------------------
// 2. Two-person zero-sum (a genuine strategic adversary)
// ---------------------------------------------------------------------------

export interface ZeroSumAnalysis {
  /** max over rows of the row-minimum: what the maximizer can guarantee. */
  lowerValue: number;
  /** min over cols of the column-maximum: what the minimizer can hold it to. */
  upperValue: number;
  hasSaddle: boolean;
  saddlePoint: { row: number; col: number; value: number } | null;
  /** Closed-form mixed strategy for a 2x2 game with no saddle point. */
  mixed2x2: { rowProbs: [number, number]; colProbs: [number, number]; value: number } | null;
}

/** Analyze a zero-sum game where the row player maximizes and the column player minimizes. */
export function analyzeZeroSum(payoffs: number[][]): ZeroSumAnalysis {
  const rows = payoffs.length;
  const cols = rows > 0 ? rowAt(payoffs, 0).length : 0;
  if (rows === 0 || cols === 0) throw new Error("payoffs must be non-empty");

  const rowMins = payoffs.map((row) => min(row));
  const lowerValue = max(rowMins);
  const colMaxs: number[] = [];
  for (let c = 0; c < cols; c++) colMaxs.push(max(payoffs.map((row) => row[c] as number)));
  const upperValue = min(colMaxs);

  let saddlePoint: ZeroSumAnalysis["saddlePoint"] = null;
  for (let i = 0; i < rows && !saddlePoint; i++) {
    for (let j = 0; j < cols; j++) {
      const v = cell(payoffs, i, j);
      if (v === (rowMins[i] as number) && v === (colMaxs[j] as number)) {
        saddlePoint = { row: i, col: j, value: v };
        break;
      }
    }
  }

  let mixed2x2: ZeroSumAnalysis["mixed2x2"] = null;
  if (!saddlePoint && rows === 2 && cols === 2) {
    const a = cell(payoffs, 0, 0);
    const b = cell(payoffs, 0, 1);
    const c = cell(payoffs, 1, 0);
    const d = cell(payoffs, 1, 1);
    const denom = a + d - b - c;
    if (denom !== 0) {
      const p = (d - c) / denom; // prob row player plays row 0
      const q = (d - b) / denom; // prob col player plays col 0
      const value = (a * d - b * c) / denom;
      mixed2x2 = { rowProbs: [p, 1 - p], colProbs: [q, 1 - q], value };
    }
  }

  return { lowerValue, upperValue, hasSaddle: saddlePoint !== null, saddlePoint, mixed2x2 };
}

// ---------------------------------------------------------------------------
// 3. Cooperative n-person (coalitions, Shapley value, core stability)
// ---------------------------------------------------------------------------

/** v(S): the value a coalition S can secure on its own. */
export type CharacteristicFunction = (members: string[]) => number;

export interface CooperativeAnalysis {
  players: string[];
  grandValue: number;
  /** Shapley value per player: a fair, efficient attribution summing to grandValue. */
  shapley: Record<string, number>;
  /** v(all) >= v(S) + v(complement) for every 2-way split. */
  superadditive: boolean;
  /** Coalitions that can beat their Shapley share (they'd rationally break away). */
  blockingCoalitions: Array<{ members: string[]; value: number; shapleyShare: number }>;
  /** True when no coalition blocks the Shapley allocation (it lies in the core). */
  shapleyInCore: boolean;
}

const MAX_PLAYERS = 12;

function membersOf(players: string[], mask: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < players.length; i++) if (mask & (1 << i)) out.push(players[i] as string);
  return out;
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Exact Shapley value via the subset formula (feasible for small n). */
export function shapleyValues(players: string[], v: CharacteristicFunction): Record<string, number> {
  const n = players.length;
  if (n > MAX_PLAYERS) throw new Error(`shapleyValues supports up to ${MAX_PLAYERS} players (got ${n})`);
  const nFact = factorial(n);
  const phi: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));

  for (let i = 0; i < n; i++) {
    const player = players[i] as string;
    // Sum over every coalition S that excludes player i.
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << i)) continue;
      const S = membersOf(players, mask);
      const withPlayer = [...S, player];
      const size = S.length;
      const weight = (factorial(size) * factorial(n - size - 1)) / nFact;
      phi[player] = (phi[player] as number) + weight * (v(withPlayer) - v(S));
    }
  }
  return phi;
}

export function analyzeCooperative(players: string[], v: CharacteristicFunction): CooperativeAnalysis {
  const n = players.length;
  if (n > MAX_PLAYERS) throw new Error(`analyzeCooperative supports up to ${MAX_PLAYERS} players (got ${n})`);
  const grandValue = v(players);
  const shapley = shapleyValues(players, v);

  let superadditive = true;
  const blockingCoalitions: CooperativeAnalysis["blockingCoalitions"] = [];
  const eps = 1e-9;

  for (let mask = 1; mask < 1 << n; mask++) {
    const S = membersOf(players, mask);
    if (S.length === n) continue;
    const complementMask = (~mask & ((1 << n) - 1)) >>> 0;
    if (complementMask !== 0) {
      const complement = membersOf(players, complementMask);
      if (grandValue + eps < v(S) + v(complement)) superadditive = false;
    }
    const shapleyShare = S.reduce((sum, p) => sum + (shapley[p] as number), 0);
    const value = v(S);
    if (value > shapleyShare + eps) blockingCoalitions.push({ members: S, value, shapleyShare });
  }

  return { players, grandValue, shapley, superadditive, blockingCoalitions, shapleyInCore: blockingCoalitions.length === 0 };
}
