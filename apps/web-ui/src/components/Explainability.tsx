import type { Counterfactual, DisqualifiedAction } from "@auto/semantic-types";

/**
 * F5 — operator chip for outcome-driven priority/confidence moves.
 * Explicitly not a probability claim.
 */
export function CalibrationExplainChip({ explain }: { explain: string }) {
  return (
    <p
      className="mt-1.5 inline-flex max-w-full items-start gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-900"
      title="Based on logged repair outcomes for this vehicle / engine family — not a calibrated probability."
    >
      <span className="shrink-0 font-semibold uppercase tracking-wide text-violet-700">
        Why this rank
      </span>
      <span className="min-w-0">{explain}</span>
    </p>
  );
}

function flipLine(cf: Counterfactual): string | null {
  const flip = cf.flips?.[0];
  if (flip) {
    return `Would need ${flip.factor} ${flip.direction} from ${formatNum(flip.current)} → ${formatNum(flip.needed)} to overtake #1.`;
  }
  const rob = cf.robustness?.[0];
  if (rob) {
    return `Stays #1 unless ${rob.factor} ${rob.direction.replace("_", " ")} ${formatNum(rob.breakEven)} (now ${formatNum(rob.current)}).`;
  }
  return null;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** D2 — why an action was removed from the ranked set. */
export function DisqualifiedActionsPanel({ items }: { items: DisqualifiedAction[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        Disqualified actions
      </h3>
      <p className="mt-0.5 text-[11px] text-amber-800/80">
        Removed for violating a non-negotiable constraint — not merely low-scoring.
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((d) => (
          <li key={d.actionId} className="text-sm text-amber-950">
            <span className="font-mono font-medium">{d.actionId}</span>
            {d.violatedConstraints.length > 0 && (
              <span className="text-amber-800">
                {" "}
                — violated: {d.violatedConstraints.join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * D2 — “why not #1” / robustness for the recommended action.
 * Renders only when the solver (or FakeLogosBridge) supplied counterfactuals.
 */
export function CounterfactualsPanel({ items }: { items: Counterfactual[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Why this ranking
      </h3>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Sensitivity to score factors — illustrative under FakeLogosBridge; full flips come from
        LOGOS solve when available.
      </p>
      <ul className="mt-2 space-y-2">
        {sorted.map((cf) => {
          const detail = flipLine(cf);
          return (
            <li key={`${cf.rank}-${cf.actionId}`} className="text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-slate-500">#{cf.rank}</span>
                <span className="font-medium">{cf.actionId}</span>
                {cf.isTop && (
                  <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                    top
                  </span>
                )}
              </div>
              {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
