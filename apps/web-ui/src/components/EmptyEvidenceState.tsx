import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export type EmptyEvidenceKind = "dtcs" | "pids" | "freeze_frame" | "mode06" | "sessions" | "generic";

const DEFAULTS: Record<EmptyEvidenceKind, { title: string; detail: string }> = {
  dtcs: {
    title: "No DTCs on file",
    detail: "Nothing to report — not the same as healthy.",
  },
  pids: {
    title: "No PID samples yet",
    detail: "Simulate a scan or connect the adapter for live Mode 01 values.",
  },
  freeze_frame: {
    title: "No freeze-frame snapshots",
    detail: "Mode 02 frames appear when an ECU exposes a freeze DTC.",
  },
  mode06: {
    title: "No Mode 06 results",
    detail: "On-board monitor tests show up after a gateway scan that reads Mode 06.",
  },
  sessions: {
    title: "No drive sessions yet",
    detail: "Start a watch session or simulate a short drive to keep evidence linked.",
  },
  generic: {
    title: "Nothing on file",
    detail: "Absence of evidence is not a clean bill of health.",
  },
};

/**
 * I5 thin shared empty state for evidence surfaces (web-ui only — full
 * `@auto/ui-components` package still future). Keeps the “not healthy” honesty.
 */
export function EmptyEvidenceState({
  kind = "generic",
  title,
  detail,
  hint,
  ingestLink = false,
  children,
}: {
  kind?: EmptyEvidenceKind;
  title?: string;
  detail?: string;
  hint?: string;
  /** Link to Dashboard evidence ingest when operator can get data on file. */
  ingestLink?: boolean;
  children?: ReactNode;
}) {
  const defaults = DEFAULTS[kind];
  return (
    <div
      role="status"
      className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-600"
    >
      <p className="font-medium text-slate-700">{title ?? defaults.title}</p>
      <p className="mt-0.5 text-slate-500">{detail ?? defaults.detail}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {ingestLink && (
        <p className="mt-1.5 text-xs">
          <a href="#evidence-ingest" className="font-medium text-sky-700 underline underline-offset-2">
            Get evidence on file
          </a>
          {" · "}
          <Link to="/guide" className="font-medium text-sky-700 underline underline-offset-2">
            Guide
          </Link>
        </p>
      )}
      {children}
    </div>
  );
}
