import type { CausalModel } from "@auto/semantic-types";

/**
 * Thin A6 surface — teaching-grade causes on a problem. Full apprentice brief
 * composition (history + AEMF story) is A7.
 */
export function CausalModelPanel({
  model,
  embedded = false,
}: {
  model: CausalModel;
  /** Nest inside CausalBriefPanel without a second card chrome. */
  embedded?: boolean;
}) {
  const hasAny =
    (model.symptoms?.length ?? 0) > 0 ||
    (model.possibleCauses?.length ?? 0) > 0 ||
    (model.mostLikelyCauses?.length ?? 0) > 0 ||
    (model.rootCauses?.length ?? 0) > 0;

  if (!hasAny) return null;

  const shell = embedded
    ? "mt-3 border-t border-sky-100 pt-3"
    : "mt-4 rounded-lg border border-slate-200 bg-white p-4";

  return (
    <section className={shell}>
      <h2 className="text-sm font-semibold text-slate-700">Causes (teaching model)</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        From cartridge catalog + current evidence — not a proven root cause until verified.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CauseList title="Symptoms now" items={model.symptoms} />
        <CauseList title="Most likely" items={model.mostLikelyCauses} emphasize />
        <CauseList title="Possible causes" items={model.possibleCauses} />
        <CauseList title="Root causes (confirmed)" items={model.rootCauses} />
      </div>
    </section>
  );
}

function CauseList({
  title,
  items,
  emphasize,
}: {
  title: string;
  items?: string[];
  emphasize?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          emphasize ? "text-sky-700" : "text-slate-400"
        }`}
      >
        {title}
      </h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item.slice(0, 80)}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
