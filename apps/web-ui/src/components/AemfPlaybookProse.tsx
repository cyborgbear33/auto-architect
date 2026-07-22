import { aemfPlaybookProse } from "@auto/ontology";

/**
 * Principled AEMF playbook framing — situates approach in air / electricity /
 * mechanical / fluid. Not a second classifier; empty when the class is unmapped.
 */
export function AemfPlaybookProse({
  className,
  prose,
}: {
  className?: string;
  /** Prefer server-stamped prose when present (recommendations). */
  prose?: string | null;
}) {
  const text = prose?.trim() || (className ? aemfPlaybookProse(className) : undefined);
  if (!text) return null;
  return (
    <div className="mt-1.5 rounded-md border border-teal-200 bg-teal-50/70 px-2.5 py-1.5 text-xs text-teal-950">
      <p className="font-semibold uppercase tracking-wide text-teal-800">Playbook framing</p>
      <p className="mt-0.5 leading-relaxed text-teal-900/90">{text}</p>
    </div>
  );
}
