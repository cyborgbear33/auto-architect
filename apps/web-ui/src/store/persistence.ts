import type { UiState } from "./uiSlice.ts";

/**
 * Whitelist-driven localStorage persistence for a few durable UI
 * preferences — NOT a generic redux-persist-style engine. Keep this list
 * short: it's a cache of trivial scalar preferences, not a place for
 * anything resembling server data.
 */
const PERSISTED_KEYS = ["selectedVehicleId"] as const satisfies readonly (keyof UiState)[];

const STORAGE_KEY = "autoarchitect:ui";

type PersistedUiState = Partial<Pick<UiState, (typeof PERSISTED_KEYS)[number]>>;

/** Best-effort read; storage being unavailable (SSR, private browsing, quota)
 *  or holding garbage never breaks app boot — it just means "nothing persisted". */
export function loadPersistedUiState(): PersistedUiState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PersistedUiState = {};
    for (const key of PERSISTED_KEYS) {
      const value = parsed[key];
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function pickPersistedFields(state: UiState): PersistedUiState {
  const out: PersistedUiState = {};
  for (const key of PERSISTED_KEYS) out[key] = state[key];
  return out;
}

export function persistUiState(state: UiState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersistedFields(state)));
  } catch {
    // Storage disabled/unavailable — persistence is a nice-to-have, not required.
  }
}
