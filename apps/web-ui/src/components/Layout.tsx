import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { api, queryKeys } from "../lib/api.ts";
import { useAppDispatch, useAppSelector } from "../store/index.ts";
import { selectVehicle, setDebugMode } from "../store/uiSlice.ts";

const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Dashboard" },
  { to: "/diagnosis", label: "Diagnosis" },
  { to: "/functions", label: "Functions" },
  { to: "/campaigns", label: "Recalls & TSBs" },
  { to: "/journal", label: "Journal" },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="text-lg font-semibold text-sky-700">🔧 Auto-Architect</div>
          <VehicleSwitcher />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              activeProps={{
                className: "block rounded-md px-3 py-2 text-sm font-medium bg-sky-50 text-sky-700",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <DebugModeToggle />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Outlet />
        </div>
      </main>
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

  if (vehiclesQ.isLoading)
    return <div className="mt-1 text-xs text-slate-400">Loading vehicles…</div>;

  return (
    <div className="mt-1.5">
      <select
        aria-label="Vehicle"
        value={selected}
        onChange={(e) => dispatch(selectVehicle(e.target.value))}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        {vehicles.length === 0 && <option value="">No vehicles yet</option>}
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {vehicleLabel(v)}
          </option>
        ))}
      </select>
    </div>
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
    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <input
        type="checkbox"
        checked={debugMode}
        onChange={(e) => dispatch(setDebugMode(e.target.checked))}
        className="rounded border-slate-300"
      />
      Debug mode (show proof detail)
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
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      No vehicle selected. Pick one from the sidebar, or add one via <code>POST /api/vehicles</code>
      .
    </div>
  );
}
