import {
  aspectLabel,
  aspectSummary,
  aspectsForClass,
  type VehicleSystemAspectId,
} from "@auto/ontology";

const ASPECT_STYLE: Record<VehicleSystemAspectId, string> = {
  air: "border-sky-200 bg-sky-50 text-sky-800",
  electricity: "border-amber-200 bg-amber-50 text-amber-900",
  mechanical: "border-stone-300 bg-stone-100 text-stone-800",
  fluid: "border-teal-200 bg-teal-50 text-teal-900",
};

/**
 * AEMF framing chips — situates a proven fault class in air / electricity /
 * mechanical / fluid. Not a second classifier; empty when unmapped.
 */
export function AemfAspectChips({ className }: { className: string }) {
  const aspects = aspectsForClass(className);
  if (aspects.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {aspects.map((aspect) => (
        <span
          key={aspect}
          title={aspectSummary(aspect)}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ASPECT_STYLE[aspect]}`}
        >
          {aspectLabel(aspect)}
        </span>
      ))}
    </div>
  );
}
