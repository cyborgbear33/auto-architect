import type { LogosBridge } from "@auto/logos-bridge";
import type { Store } from "../store/index.ts";
import { mapBridgeError } from "../lib/bridge-errors.ts";

/** The PID obd-gateway/manual entry should log for the oil-consumption trend. */
export const OIL_LEVEL_PID = "OIL_LEVEL_PCT";

/**
 * Below this level, per the W80 dealer test's "below the ADD mark" failure
 * criterion (approximated here as a percentage of full — see docs/AI_HANDOFF.md
 * for how to calibrate this to your dipstick's actual ADD-to-FULL range).
 */
export const OIL_LEVEL_ADD_MARK_PCT = 15;

export interface OilTrend {
  declining: boolean;
  series: Array<{ timestamp: string; value: number }>;
}

/**
 * Projects logged oil-level samples toward the ADD-mark threshold — an
 * automated version of the W80 Customer Satisfaction Notification's manual
 * "drive 1500-1700 miles, recheck after a 5-minute hot shutdown" procedure.
 * `RecognitionService` folds a positive result into the ABox as an
 * `OilLevelDecline` Trend individual, which is what actually proves
 * `ChronicOilConsumption` — `forecast` is evidence, not a class by itself.
 */
export class ForecastService {
  constructor(
    private store: Store,
    private bridge: LogosBridge,
  ) {}

  async oilLevelTrend(vehicleId: string): Promise<OilTrend> {
    const series = await this.store.observations.series(vehicleId, OIL_LEVEL_PID);
    if (series.length < 2) return { declining: false, series };
    try {
      const result = await this.bridge.forecast({
        series: series.map((s) => ({ timestamp: s.timestamp, value: s.value })),
        threshold: OIL_LEVEL_ADD_MARK_PCT,
      });
      const declining =
        result.direction === "falling" && (result.willCross || (result.current ?? Infinity) <= OIL_LEVEL_ADD_MARK_PCT);
      return { declining, series };
    } catch (err) {
      throw mapBridgeError(err);
    }
  }
}
