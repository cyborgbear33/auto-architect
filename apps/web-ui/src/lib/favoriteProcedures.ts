/**
 * Operator-pinned special procedures. localStorage only — a shortcut, not a
 * DecisionRecord and not evidence that a fault is proven.
 */
const STORAGE_KEY = "autoarchitect:favoriteProcedures";

function readIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Persistence is best-effort.
  }
}

export function loadFavoriteProcedureIds(): string[] {
  return readIds();
}

export function setFavoriteProcedure(id: string, favorite: boolean): string[] {
  const without = readIds().filter((existing) => existing !== id);
  const next = favorite ? [...without, id] : without;
  writeIds(next);
  return next;
}
