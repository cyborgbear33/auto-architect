import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";
import { useAppDispatch, useAppSelector } from "../store/index.ts";
import { selectVehicle, setDebugMode } from "../store/uiSlice.ts";

/** Goal-grouped rail — short labels, one job per destination. See UX_GUIDELINES §4. */
const NAV_GROUPS: Array<{ label: string; items: Array<{ to: string; label: string }> }> = [
  { label: "Operate", items: [{ to: "/", label: "Dashboard" }] },
  { label: "Diagnose", items: [{ to: "/diagnosis", label: "Diagnosis" }] },
  {
    label: "Learn",
    items: [
      { to: "/discovery", label: "Discovery" },
      { to: "/guide", label: "Guide" },
    ],
  },
  { label: "Procedures", items: [{ to: "/functions", label: "Functions" }] },
  { label: "Reference", items: [{ to: "/campaigns", label: "Recalls & TSBs" }] },
  { label: "History", items: [{ to: "/journal", label: "Journal" }] },
];

const linkClass =
  "block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white";
/** Concatenated onto linkClass when active — delta only, or colors fight. */
const linkActiveClass = "bg-sky-400/15 font-medium text-sky-200!";

function AppRail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="border-b border-slate-800 px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">
          Diagnostic console
        </p>
        <p className="text-base font-semibold tracking-tight text-white">Auto-Architect</p>
        <div className="mt-3">
          <VehicleSwitcher />
        </div>
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-3 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  onClick={onNavigate}
                  className={linkClass}
                  activeProps={{ className: linkActiveClass }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <DebugModeToggle />
      </div>
    </>
  );
}

export function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const selected = useAppSelector((s) => s.ui.selectedVehicleId);
  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles(),
    queryFn: () => api.listVehicles(),
    retry: false,
  });
  const current = vehiclesQ.data?.find((v) => v.id === selected);
  const currentLabel = current ? vehicleLabel(current) : "No vehicle selected";
  const closeNav = () => setNavOpen(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900"
      >
        Skip to content
      </a>

      <aside className="hidden w-64 shrink-0 flex-col bg-slate-950 text-slate-200 md:flex">
        <AppRail />
      </aside>

      {navOpen && (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default bg-slate-950/60 md:hidden"
            onClick={closeNav}
          />
          <aside
            id="app-nav"
            className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-200 md:hidden"
          >
            <AppRail onNavigate={closeNav} />
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 text-white md:hidden">
          <button
            type="button"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            onClick={() => setNavOpen((open) => !open)}
            className="rounded-md border border-slate-700 px-2.5 py-1.5 text-sm font-medium text-slate-100"
          >
            {navOpen ? "Close" : "Menu"}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{currentLabel}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Auto-Architect</p>
          </div>
        </header>
        <main id="main" className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Single global "current vehicle" control: switches every page at once. */
export function VehicleSwitcher() {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((s) => s.ui.selectedVehicleId);
  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles(),
    queryFn: () => api.listVehicles(),
    retry: false,
  });
  const vehicles = vehiclesQ.data ?? [];

  // Reconcile the current selection against the actual vehicle list exactly
  // once per mount: single-vehicle setups "just work", and a stale/foreign
  // persisted id falls back to the first vehicle.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!vehiclesQ.isSuccess || reconciledRef.current) return;
    reconciledRef.current = true;
    const firstId = vehicles[0]?.id;
    const stillValid = vehicles.some((v) => v.id === selected);
    if (!stillValid && firstId) dispatch(selectVehicle(firstId));
  }, [selected, vehicles, vehiclesQ.isSuccess, dispatch]);

  if (vehiclesQ.isLoading) {
    return <p className="text-xs text-slate-400">Loading vehicles…</p>;
  }

  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Vehicle
      </span>
      <select
        value={selected}
        onChange={(e) => dispatch(selectVehicle(e.target.value))}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
      >
        {vehicles.length === 0 && <option value="">No vehicles yet</option>}
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {vehicleLabel(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function vehicleLabel(v: {
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

function DebugModeToggle() {
  const dispatch = useAppDispatch();
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  return (
    <label className="flex items-start gap-2 text-xs text-slate-400">
      <input
        type="checkbox"
        checked={debugMode}
        onChange={(e) => dispatch(setDebugMode(e.target.checked))}
        className="mt-0.5 rounded border-slate-600"
      />
      <span>
        <span className="font-medium text-slate-300">Technical detail</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
          Monitor ids, ranking scores, and undecided classes. Leave off unless you need them.
        </span>
      </span>
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function useSelectedVehicleId(): string {
  return useAppSelector((s) => s.ui.selectedVehicleId);
}

export function EmptyVehicleState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
      <p className="font-medium text-slate-800">No vehicle selected</p>
      <p className="mt-1">
        Choose a vehicle from the menu. If the list is empty, add a vehicle profile first — this
        console will not invent one.
      </p>
    </div>
  );
}
