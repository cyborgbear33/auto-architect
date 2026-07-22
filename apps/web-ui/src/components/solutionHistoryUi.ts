import type { ClassEvidence, SolutionHistory, SolutionRollupBucket } from "@auto/semantic-types";

/** Join a DTC code to a proven class via recognition classEvidence (never invent). */
export function faultClassForDtc(
  code: string,
  classEvidence: ClassEvidence[] | undefined,
): string | undefined {
  const upper = code.toUpperCase();
  for (const ev of classEvidence ?? []) {
    if (ev.dtcs.some((d) => d.code.toUpperCase() === upper)) return ev.className;
  }
  return undefined;
}

export function summarizeBucket(bucket: SolutionRollupBucket): string {
  const parts: string[] = [];
  if (bucket.worked) parts.push(`${bucket.worked} worked`);
  if (bucket.partial) parts.push(`${bucket.partial} partial`);
  if (bucket.failed) parts.push(`${bucket.failed} failed`);
  if (bucket.inconclusive) parts.push(`${bucket.inconclusive} inconclusive`);
  const base = parts.join(" · ") || "no outcomes";
  return `${base} · n=${bucket.totalWithOutcome}`;
}

export function smallNAdvisory(bucket: SolutionRollupBucket): string | null {
  const n = bucket.totalWithOutcome;
  if (n === 0) return null;
  if (bucket.scope === "vehicle" && n < 2) return "Small sample (n<2) — advisory only";
  if (bucket.scope === "engineFamily" && n < 4) return "Small sample (n<4 family) — advisory only";
  return null;
}

/** Prefer vehicle buckets with worked>0, else family; highest worked then n. */
export function topWorkedBuckets(history: SolutionHistory, limit = 2): SolutionRollupBucket[] {
  const scored = (list: SolutionRollupBucket[]) =>
    [...list]
      .filter((b) => b.worked > 0)
      .sort(
        (a, b) =>
          b.worked - a.worked ||
          b.totalWithOutcome - a.totalWithOutcome ||
          a.actionId.localeCompare(b.actionId),
      );
  const vehicle = scored(history.vehicle);
  if (vehicle.length > 0) return vehicle.slice(0, limit);
  return scored(history.engineFamilyRollup).slice(0, limit);
}
