import type { CaseTimelineEvent, CaseTimelineEventType } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, queryKeys } from "../lib/api.ts";

const TYPE_LABEL: Record<CaseTimelineEventType, string> = {
  opened: "Opened",
  ranked: "Ranked",
  repair_logged: "Repair",
  verify_started: "Verify started",
  verify_result: "Verify result",
  closed_solved: "Solved",
  abandoned: "Abandoned",
  escalated: "Escalated",
  reopened: "Reopened",
};

const TYPE_DOT: Record<CaseTimelineEventType, string> = {
  opened: "bg-slate-400",
  ranked: "bg-indigo-500",
  repair_logged: "bg-sky-500",
  verify_started: "bg-amber-400",
  verify_result: "bg-amber-600",
  closed_solved: "bg-green-500",
  abandoned: "bg-slate-300",
  escalated: "bg-orange-500",
  reopened: "bg-violet-500",
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function EventRow({
  event,
  showProblemLink,
}: {
  event: CaseTimelineEvent;
  showProblemLink: boolean;
}) {
  return (
    <li className="relative flex gap-3 pl-1">
      <span
        className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${TYPE_DOT[event.type]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {TYPE_LABEL[event.type]}
          </span>
          <time className="text-xs text-slate-400" dateTime={event.at}>
            {formatWhen(event.at)}
          </time>
          {event.odometerMiles !== undefined && (
            <span className="text-xs text-slate-400">
              {event.odometerMiles.toLocaleString()} mi
            </span>
          )}
          {event.sessionId && (
            <span className="truncate font-mono text-[11px] text-slate-400" title={event.sessionId}>
              {event.sessionId.replace(/^session:/, "sess…")}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-700">{event.summary}</p>
        {showProblemLink && (
          <Link
            to="/problems/$problemId"
            params={{ problemId: event.problemId }}
            className="mt-0.5 inline-block text-xs font-medium text-sky-700 hover:underline"
          >
            {event.faultClass ?? event.problemId}
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Case narrative from problems + decisions. Journal remains the flat decision audit.
 */
export function CaseTimelinePanel({
  vehicleId,
  problemId,
  limit,
  title = "Case timeline",
}: {
  vehicleId: string;
  /** When set, only that case. When omitted, vehicle-wide (newest-first strip). */
  problemId?: string;
  /** Cap for vehicle-wide strip; ignored when problem-scoped. */
  limit?: number;
  title?: string;
}) {
  const scoped = Boolean(problemId);
  const timelineQ = useQuery({
    queryKey: queryKeys.caseTimeline(vehicleId, problemId),
    queryFn: () => api.getCaseTimeline(vehicleId, problemId),
  });

  let events = timelineQ.data?.events ?? [];
  if (!scoped) {
    events = [...events].reverse();
    if (limit != null) events = events.slice(0, limit);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mb-3 text-xs text-slate-400">
        Derived from case state and logged repairs — not a substitute for the Journal audit.
      </p>
      {timelineQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {timelineQ.data && events.length === 0 && (
        <p className="text-sm text-slate-400">No case events yet.</p>
      )}
      {events.length > 0 && (
        <ol className="relative border-l border-slate-200 pl-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} showProblemLink={!scoped} />
          ))}
        </ol>
      )}
    </section>
  );
}
