/**
 * Outcome → confidence calibration.
 *
 * Shrinks empirical repair success rates toward cartridge playbook priors so
 * small samples stay cautious. Never invents fault classes — only reweights
 * actions/recommendations for classes realize already proved.
 */
import type {
  CalibrationMeta,
  CandidateAction,
  Recommendation,
  SolutionHistory,
  SolutionRollupBucket,
} from "@auto/semantic-types";

export type CalibrationScope = CalibrationMeta["scope"];

export interface CalibratedAction {
  action: CandidateAction;
  priorConfidence: number;
  calibratedConfidence: number;
  scope: CalibrationScope;
  sampleSize: number;
}

export interface ClassCalibration {
  faultClass: string;
  actions: CalibratedAction[];
  recommendationConfidence: number;
  priority: Recommendation["priority"];
  explain: string | null;
}

const PRIORITY_RANK: Recommendation["priority"][] = ["low", "normal", "high", "critical"];

const URGENCY_TO_PRIORITY: Record<string, Recommendation["priority"]> = {
  critical: "critical",
  high: "high",
  medium: "normal",
  low: "low",
};

export function empiricalSuccessRate(bucket: SolutionRollupBucket): {
  rate: number | null;
  n: number;
} {
  const n = bucket.worked + bucket.partial + bucket.failed;
  if (n === 0) return { rate: null, n: 0 };
  const successWeight = bucket.worked + 0.5 * bucket.partial;
  return { rate: successWeight / n, n };
}

export function shrinkTowardPrior(
  prior: number,
  empirical: number | null,
  n: number,
  k: number,
): number {
  const p = clamp(prior, 0.05, 0.95);
  if (empirical === null || n <= 0) return p;
  return clamp((n * empirical + k * p) / (n + k), 0.05, 0.95);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function findBucket(
  buckets: SolutionRollupBucket[],
  actionId: string,
  faultClass: string,
): SolutionRollupBucket | undefined {
  return buckets.find((b) => b.actionId === actionId && b.faultClass === faultClass);
}

function bumpPriority(base: Recommendation["priority"], up: boolean): Recommendation["priority"] {
  const i = PRIORITY_RANK.indexOf(base);
  if (i < 0) return base;
  if (up) return PRIORITY_RANK[Math.min(PRIORITY_RANK.length - 1, i + 1)]!;
  return base;
}

function metaFromCalibrated(c: CalibratedAction): CalibrationMeta {
  return {
    scope: c.scope,
    sampleSize: c.sampleSize,
    priorConfidence: c.priorConfidence,
    calibratedConfidence: c.calibratedConfidence,
  };
}

/** Best (highest calibrated confidence among sampled) meta for a ClassCalibration. */
export function bestCalibrationMeta(calibration: ClassCalibration): CalibrationMeta | null {
  const withSamples = calibration.actions.filter((c) => c.sampleSize > 0);
  if (withSamples.length === 0) {
    const first = calibration.actions[0];
    return first ? metaFromCalibrated(first) : null;
  }
  const best = withSamples.reduce((a, b) =>
    a.calibratedConfidence >= b.calibratedConfidence ? a : b,
  );
  return metaFromCalibrated(best);
}

/**
 * Calibrate playbook actions for one proven fault class using solution history.
 */
export function calibratePlaybook(input: {
  faultClass: string;
  actions: CandidateAction[];
  history: SolutionHistory;
  urgency?: string;
  kVehicle?: number;
  kFamily?: number;
}): ClassCalibration {
  const kVehicle = input.kVehicle ?? 2;
  const kFamily = input.kFamily ?? 4;
  const basePriority =
    URGENCY_TO_PRIORITY[input.urgency ?? "medium"] ?? ("normal" as Recommendation["priority"]);

  const calibrated: CalibratedAction[] = input.actions.map((action) => {
    const prior = action.confidence ?? 0.5;
    const vehicleBucket = findBucket(input.history.vehicle, action.id, input.faultClass);
    const familyBucket = findBucket(input.history.engineFamilyRollup, action.id, input.faultClass);

    if (vehicleBucket) {
      const { rate, n } = empiricalSuccessRate(vehicleBucket);
      const calibratedConfidence = shrinkTowardPrior(prior, rate, n, kVehicle);
      return {
        action: {
          ...action,
          confidence: calibratedConfidence,
          calibrationMeta: {
            scope: "vehicle",
            sampleSize: n,
            priorConfidence: prior,
            calibratedConfidence,
          },
        },
        priorConfidence: prior,
        calibratedConfidence,
        scope: "vehicle",
        sampleSize: n,
      };
    }
    if (familyBucket) {
      const { rate, n } = empiricalSuccessRate(familyBucket);
      const calibratedConfidence = shrinkTowardPrior(prior, rate, n, kFamily);
      return {
        action: {
          ...action,
          confidence: calibratedConfidence,
          calibrationMeta: {
            scope: "engineFamily",
            sampleSize: n,
            priorConfidence: prior,
            calibratedConfidence,
          },
        },
        priorConfidence: prior,
        calibratedConfidence,
        scope: "engineFamily",
        sampleSize: n,
      };
    }
    return {
      action: {
        ...action,
        confidence: prior,
        calibrationMeta: {
          scope: "prior",
          sampleSize: 0,
          priorConfidence: prior,
          calibratedConfidence: prior,
        },
      },
      priorConfidence: prior,
      calibratedConfidence: prior,
      scope: "prior",
      sampleSize: 0,
    };
  });

  const withSamples = calibrated.filter((c) => c.sampleSize > 0);
  const recommendationConfidence =
    withSamples.length > 0
      ? withSamples.reduce((s, c) => s + c.calibratedConfidence, 0) / withSamples.length
      : calibrated.length > 0
        ? calibrated.reduce((s, c) => s + c.calibratedConfidence, 0) / calibrated.length
        : 0.5;

  // One-step priority bump only when a vehicle-scoped action is cleanly successful.
  let priority = basePriority;
  let explain: string | null = null;
  const strong = calibrated.find(
    (c) =>
      c.scope === "vehicle" &&
      c.sampleSize >= 2 &&
      findBucket(input.history.vehicle, c.action.id, input.faultClass)?.failed === 0 &&
      findBucket(input.history.vehicle, c.action.id, input.faultClass)!.worked >= 2,
  );
  if (strong) {
    priority = bumpPriority(basePriority, true);
    const b = findBucket(input.history.vehicle, strong.action.id, input.faultClass)!;
    explain = `${strong.action.id} worked ${b.worked}/${b.worked + b.partial + b.failed} on this vehicle — priority raised one step (still not a probability claim).`;
  } else if (withSamples.length > 0) {
    const best = withSamples.reduce((a, b) =>
      a.calibratedConfidence >= b.calibratedConfidence ? a : b,
    );
    explain = `${best.action.id} confidence ${best.priorConfidence.toFixed(2)}→${best.calibratedConfidence.toFixed(2)} from ${best.sampleSize} outcome(s) (${best.scope}).`;
  }

  return {
    faultClass: input.faultClass,
    actions: calibrated,
    recommendationConfidence: clamp(recommendationConfidence, 0.05, 0.95),
    priority,
    explain,
  };
}

export function applyCalibration(
  actions: CandidateAction[],
  calibration: ClassCalibration,
): CandidateAction[] {
  const byId = new Map(calibration.actions.map((c) => [c.action.id, c.action]));
  return actions.map((a) => byId.get(a.id) ?? a);
}
