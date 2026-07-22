import {
  DEFAULT_LIVE_GAUGE_PIDS,
  normalizeLiveGaugePids,
} from "@auto/semantic-types";

/**
 * Per-vehicle saved Mode 01 gauge layout (UX3). localStorage only — not
 * server data; garage export does not need to carry operator dash prefs.
 */
const STORAGE_KEY = "autoarchitect:gaugeLayouts";

type LayoutMap = Record<string, string[]>;

function readMap(): LayoutMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LayoutMap;
  } catch {
    return {};
  }
}

function writeMap(map: LayoutMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Persistence is best-effort.
  }
}

export function loadGaugeLayout(vehicleId: string): string[] {
  if (!vehicleId) return [...DEFAULT_LIVE_GAUGE_PIDS];
  return normalizeLiveGaugePids(readMap()[vehicleId]);
}

export function saveGaugeLayout(vehicleId: string, pids: readonly string[]): string[] {
  const normalized = normalizeLiveGaugePids(pids);
  if (!vehicleId) return normalized;
  const map = readMap();
  map[vehicleId] = normalized;
  writeMap(map);
  return normalized;
}

export function resetGaugeLayout(vehicleId: string): string[] {
  if (vehicleId) {
    const map = readMap();
    delete map[vehicleId];
    writeMap(map);
  }
  return [...DEFAULT_LIVE_GAUGE_PIDS];
}
