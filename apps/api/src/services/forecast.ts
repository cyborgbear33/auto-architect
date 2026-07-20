import type { LogosBridge } from "@auto/logos-bridge";
import { mapBridgeError } from "../lib/bridge-errors.ts";
import type { Store } from "../store/index.ts";

/** The PID obd-gateway/manual entry should log for the oil-consumption trend. */
export const OIL_LEVEL_PID = "OIL_LEVEL_PCT";
export const LTFT_B1_PID = "LONG_FUEL_TRIM_1";
export const LTFT_B2_PID = "LONG_FUEL_TRIM_2";
export const COOLANT_PID = "COOLANT_TEMP";
export const ENGINE_LOAD_PID = "ENGINE_LOAD";

/**
 * Below this level, per the W80 dealer test's "below the ADD mark" failure
 * criterion (approximated here as a percentage of full — see docs/AI_HANDOFF.md
 * for how to calibrate this to your dipstick's actual ADD-to-FULL range).
 */
export const OIL_LEVEL_ADD_MARK_PCT = 15;

/** Sustained positive LTFT threshold (matches lean-fuel cartridge). */
export const POSITIVE_TRIM_PCT = 10;

/** High engine load threshold (matches misfire cartridge). */
export const HIGH_LOAD_PCT = 70;

/** Coolant climb advisory threshold (°C) — informing only, no fault class yet. */
export const COOLANT_CLIMB_THRESHOLD_C = 105;

export interface OilTrend {
  declining: boolean;
  series: Array<{ timestamp: string; value: number }>;
}

export type SignalTrendDirection = "rising" | "falling" | "flat" | "unknown";

export interface SignalTrend {
  id: string;
  pid: string;
  label: string;
  series: Array<{ timestamp: string; value: number }>;
  direction: SignalTrendDirection;
  /** True when this series should feed recognition (ontology-backed). */
  flagged: boolean;
  flagReason?: string;
  /** Ontology Trend concept when flagged for realize. */
  ontologyTrend?: string;
}

export interface ForecastSummary {
  declining: boolean;
  series: Array<{ timestamp: string; value: number }>;
  signals: SignalTrend[];
  /** Ontology-backed trends currently flagged for ABox fold-in. */
  recognitionTrends: string[];
}

interface SignalSpec {
  id: string;
  pid: string;
  label: string;
  threshold: number;
  /** Flag when falling toward / past threshold (oil). */
  flagFalling?: boolean;
  /** Flag when rising toward / past threshold (trim, load, coolant). */
  flagRising?: boolean;
  /** Also flag when ≥2 samples already exceed threshold (recurring). */
  flagRecurringAbove?: boolean;
  ontologyTrend?: string;
  /** When false, surface in UI only — never invent a class. */
  feedsRecognition?: boolean;
}

const SIGNAL_SPECS: SignalSpec[] = [
  {
    id: "oil-level",
    pid: OIL_LEVEL_PID,
    label: "Oil level",
    threshold: OIL_LEVEL_ADD_MARK_PCT,
    flagFalling: true,
    ontologyTrend: "OilLevelDecline",
    feedsRecognition: true,
  },
  {
    id: "ltft-b1",
    pid: LTFT_B1_PID,
    label: "LTFT bank 1",
    threshold: POSITIVE_TRIM_PCT,
    flagRising: true,
    ontologyTrend: "RisingFuelTrim",
    feedsRecognition: true,
  },
  {
    id: "ltft-b2",
    pid: LTFT_B2_PID,
    label: "LTFT bank 2",
    threshold: POSITIVE_TRIM_PCT,
    flagRising: true,
    ontologyTrend: "RisingFuelTrim",
    feedsRecognition: true,
  },
  {
    id: "engine-load",
    pid: ENGINE_LOAD_PID,
    label: "Engine load",
    threshold: HIGH_LOAD_PCT,
    flagRising: true,
    flagRecurringAbove: true,
    ontologyTrend: "RecurringHighLoad",
    feedsRecognition: true,
  },
  {
    id: "coolant",
    pid: COOLANT_PID,
    label: "Coolant temp",
    threshold: COOLANT_CLIMB_THRESHOLD_C,
    flagRising: true,
    feedsRecognition: false,
  },
];

/**
 * Projects logged PID series toward thresholds. Oil feeds ChronicOilConsumption;
 * rising LTFT / recurring high load feed lean and misfire-under-load via
 * ontology Trends. Coolant is informing-only until a class is declared.
 */
export class ForecastService {
  constructor(
    private store: Store,
    private bridge: LogosBridge,
  ) {}

  async oilLevelTrend(vehicleId: string): Promise<OilTrend> {
    const summary = await this.summary(vehicleId);
    return { declining: summary.declining, series: summary.series };
  }

  async summary(vehicleId: string): Promise<ForecastSummary> {
    const signals: SignalTrend[] = [];
    for (const spec of SIGNAL_SPECS) {
      signals.push(await this.evaluateSignal(vehicleId, spec));
    }
    const oil = signals.find((s) => s.id === "oil-level");
    const recognitionTrends = [
      ...new Set(
        signals
          .filter((s) => s.flagged && s.ontologyTrend)
          .map((s) => s.ontologyTrend as string),
      ),
    ];
    return {
      declining: oil?.flagged ?? false,
      series: oil?.series ?? [],
      signals,
      recognitionTrends,
    };
  }

  private async evaluateSignal(vehicleId: string, spec: SignalSpec): Promise<SignalTrend> {
    const series = await this.store.observations.series(vehicleId, spec.pid);
    if (series.length < 2) {
      return {
        id: spec.id,
        pid: spec.pid,
        label: spec.label,
        series,
        direction: "unknown",
        flagged: false,
      };
    }

    try {
      const result = await this.bridge.forecast({
        series: series.map((s) => ({ timestamp: s.timestamp, value: s.value })),
        threshold: spec.threshold,
      });
      const direction = result.direction;
      const current = result.current ?? series[series.length - 1]?.value ?? null;
      const aboveCount = series.filter((s) => s.value > spec.threshold).length;

      let flagged = false;
      let flagReason: string | undefined;

      if (spec.feedsRecognition !== false && spec.flagFalling) {
        if (
          direction === "falling" &&
          (result.willCross || (current != null && current <= spec.threshold))
        ) {
          flagged = true;
          flagReason = `falling toward ${spec.threshold}`;
        }
      }
      if (spec.feedsRecognition !== false && spec.flagRising) {
        if (
          direction === "rising" &&
          (result.willCross || (current != null && current >= spec.threshold))
        ) {
          flagged = true;
          flagReason = `rising toward ${spec.threshold}`;
        }
      }
      if (spec.feedsRecognition !== false && spec.flagRecurringAbove && aboveCount >= 2) {
        flagged = true;
        flagReason = `${aboveCount} samples above ${spec.threshold}`;
      }

      // Coolant (and any feedsRecognition:false): surface direction only.
      if (spec.feedsRecognition === false) {
        flagged = false;
        if (
          direction === "rising" &&
          (result.willCross || (current != null && current >= spec.threshold))
        ) {
          flagReason = `climbing toward ${spec.threshold}°C (informing only)`;
        }
      }

      return {
        id: spec.id,
        pid: spec.pid,
        label: spec.label,
        series,
        direction,
        flagged,
        ...(flagReason ? { flagReason } : {}),
        ...(spec.ontologyTrend && flagged ? { ontologyTrend: spec.ontologyTrend } : {}),
      };
    } catch (err) {
      throw mapBridgeError(err);
    }
  }
}
