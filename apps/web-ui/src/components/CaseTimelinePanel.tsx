import type { CaseTimelineEvent, CaseTimelineEventType } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

const ALL_TYPES = Object.keys(TYPE_LABEL) as CaseTimelineEventType[];

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

function dayStartIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00.000Z`;
}

function dayEndIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59.999Z`;
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
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {showProblemLink && (
            <Link
              to="/problems/$problemId"
              params={{ problemId: event.problemId }}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              {event.faultClass ?? event.problemId}
            </Link>
          )}
          <a href="/#evidence" className="text-xs font-medium text-sky-700 hover:underline">
            Evidence
          </a>
          {event.sessionId && (
            <a
              href={`/#session:${encodeURIComponent(event.sessionId)}`}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              Drive session
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export interface TimelineFilters {
  faultClass: string;
  eventType: "" | CaseTimelineEventType;
  dateFrom: string;
  dateTo: string;
  milesMin: string;
  milesMax: string;
}

const EMPTY_FILTERS: TimelineFilters = {
  faultClass: "",
  eventType: "",
  dateFrom: "",
  dateTo: "",
  milesMin: "",
  milesMax: "",
};

/** Pure filter helper — exported for unit tests (H4). */
export function applyTimelineFilters(
  events: CaseTimelineEvent[],
  filters: TimelineFilters,
): CaseTimelineEvent[] {
  const classNeedle = filters.faultClass.trim().toLowerCase();
  const milesMin = filters.milesMin.trim() === "" ? null : Number(filters.milesMin);
  const milesMax = filters.milesMax.trim() === "" ? null : Number(filters.milesMax);
  const from = filters.dateFrom ? dayStartIso(filters.dateFrom) : null;
  const to = filters.dateTo ? dayEndIso(filters.dateTo) : null;

  return events.filter((e) => {
    if (classNeedle && !(e.faultClass ?? "").toLowerCase().includes(classNeedle)) return false;
    if (filters.eventType && e.type !== filters.eventType) return false;
    if (from && e.at < from) return false;
    if (to && e.at > to) return false;
    if (milesMin != null && !Number.isNaN(milesMin)) {
      if (e.odometerMiles === undefined || e.odometerMiles < milesMin) return false;
    }
    if (milesMax != null && !Number.isNaN(milesMax)) {
      if (e.odometerMiles === undefined || e.odometerMiles > milesMax) return false;
    }
    return true;
  });
}

/**
 * Case narrative from problems + decisions. Journal remains the flat decision audit.
 * H4: class / type / date / mileage filters. H5: deep-links to Dashboard evidence + session.
 */
export function CaseTimelinePanel({
  vehicleId,
  problemId,
  limit,
  title = "Case timeline",
  showFilters = true,
}: {
  vehicleId: string;
  /** When set, only that case. When omitted, vehicle-wide (newest-first strip). */
  problemId?: string;
  /** Cap for vehicle-wide strip; ignored when problem-scoped. */
  limit?: number;
  title?: string;
  /** H4 filter chrome (default on). */
  showFilters?: boolean;
}) {
  const scoped = Boolean(problemId);
  const [filters, setFilters] = useState<TimelineFilters>(EMPTY_FILTERS);

  const timelineQ = useQuery({
    queryKey: queryKeys.caseTimeline(vehicleId, problemId),
    queryFn: () => api.getCaseTimeline(vehicleId, problemId),
  });

  const filtered = useMemo(() => {
    let events = timelineQ.data?.events ?? [];
    if (!scoped) {
      events = [...events].reverse();
    }
    events = applyTimelineFilters(events, filters);
    if (!scoped && limit != null) events = events.slice(0, limit);
    return events;
  }, [timelineQ.data?.events, scoped, filters, limit]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of timelineQ.data?.events ?? []) {
      if (e.faultClass) set.add(e.faultClass);
    }
    return [...set].sort();
  }, [timelineQ.data?.events]);

  const filtersActive =
    filters.faultClass !== "" ||
    filters.eventType !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.milesMin !== "" ||
    filters.milesMax !== "";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mb-3 text-xs text-slate-400">
        Derived from case state and logged repairs — not a substitute for the Journal audit.
      </p>

      {showFilters && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block text-[11px] font-medium text-slate-500">
            Class
            <select
              value={filters.faultClass}
              onChange={(e) => setFilters({ ...filters, faultClass: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
            >
              <option value="">All</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-slate-500">
            Event
            <select
              value={filters.eventType}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  eventType: e.target.value as TimelineFilters["eventType"],
                })
              }
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
            >
              <option value="">All</option>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-slate-500">
            From
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
            />
          </label>
          <label className="block text-[11px] font-medium text-slate-500">
            To
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
            />
          </label>
          <label className="block text-[11px] font-medium text-slate-500">
            Min mi
            <input
              type="number"
              inputMode="numeric"
              value={filters.milesMin}
              onChange={(e) => setFilters({ ...filters, milesMin: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
              placeholder="—"
            />
          </label>
          <label className="block text-[11px] font-medium text-slate-500">
            Max mi
            <input
              type="number"
              inputMode="numeric"
              value={filters.milesMax}
              onChange={(e) => setFilters({ ...filters, milesMax: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
              placeholder="—"
            />
          </label>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="col-span-2 self-end text-left text-xs font-medium text-sky-700 hover:underline sm:col-span-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {timelineQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {timelineQ.data && filtered.length === 0 && (
        <p className="text-sm text-slate-400">
          {filtersActive ? "No events match these filters." : "No case events yet."}
        </p>
      )}
      {filtered.length > 0 && (
        <ol className="relative border-l border-slate-200 pl-3">
          {filtered.map((event) => (
            <EventRow key={event.id} event={event} showProblemLink={!scoped} />
          ))}
        </ol>
      )}
    </section>
  );
}
