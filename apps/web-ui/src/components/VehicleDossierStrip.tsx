import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiError, api, queryKeys } from "../lib/api.ts";
import { vehicleLabel } from "./Layout.tsx";

/**
 * V1 — identity strip on Diagnosis: know the vehicle before deep causal teaching.
 * VIN/odo are operator-entered only — never invented from empty evidence.
 */
export function VehicleDossierStrip({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const [vinDraft, setVinDraft] = useState("");
  const [odoDraft, setOdoDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const vehicleQ = useQuery({
    queryKey: queryKeys.vehicle(vehicleId),
    queryFn: () => api.getVehicle(vehicleId),
  });
  const discoveryQ = useQuery({
    queryKey: queryKeys.discovery(vehicleId),
    queryFn: () => api.getDiscovery(vehicleId),
    retry: false,
  });
  const campaignsQ = useQuery({
    queryKey: queryKeys.campaigns(vehicleId),
    queryFn: () => api.getCampaigns(vehicleId),
  });

  const vehicle = vehicleQ.data;
  const discoveryMissing =
    discoveryQ.error instanceof ApiError && discoveryQ.error.statusCode === 404;
  const campaignCount =
    (campaignsQ.data?.campaigns.length ?? 0) + (campaignsQ.data?.tsbs.length ?? 0);

  useEffect(() => {
    if (!vehicle) return;
    setVinDraft(vehicle.vin ?? "");
    setOdoDraft(vehicle.odometerMiles !== undefined ? String(vehicle.odometerMiles) : "");
  }, [vehicle]);

  const save = useMutation({
    mutationFn: () => {
      const vinTrim = vinDraft.trim();
      const odoRaw = odoDraft.trim();
      const odometerMiles =
        odoRaw === "" ? null : Number.parseInt(odoRaw.replace(/,/g, ""), 10);
      if (odoRaw !== "" && !Number.isFinite(odometerMiles)) {
        throw new Error("Odometer must be a non-negative whole number.");
      }
      return api.patchVehicleIdentity(vehicleId, {
        vin: vinTrim === "" ? null : vinTrim,
        odometerMiles,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.vehicle(vehicleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.vehicles() });
      setEditing(false);
    },
  });

  if (vehicleQ.isLoading) {
    return (
      <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-400">Loading vehicle dossier…</p>
      </section>
    );
  }
  if (!vehicle) return null;

  const vinMissing = !vehicle.vin?.trim();
  const odoMissing = vehicle.odometerMiles === undefined;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Vehicle dossier</h2>
          <p className="mt-0.5 text-sm text-slate-700">{vehicleLabel(vehicle)}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{vehicle.engineFamily}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <Link to="/discovery" className="font-medium text-sky-700 hover:underline">
            {discoveryMissing
              ? "Discovery not run"
              : discoveryQ.data
                ? "Discovery on file"
                : "Discovery…"}
          </Link>
          <Link to="/campaigns" className="font-medium text-sky-700 hover:underline">
            {campaignsQ.isLoading
              ? "Campaigns…"
              : campaignCount === 0
                ? "No matched campaigns"
                : `${campaignCount} campaign/TSB match${campaignCount === 1 ? "" : "es"}`}
          </Link>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">VIN</dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {vinMissing ? (
              <span className="text-amber-800">Not recorded — enter before claiming identity</span>
            ) : (
              <span className="font-mono tracking-wide">{vehicle.vin}</span>
            )}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Odometer
          </dt>
          <dd className="mt-0.5 text-sm text-slate-800">
            {odoMissing ? (
              <span className="text-amber-800">Not recorded</span>
            ) : (
              `${vehicle.odometerMiles!.toLocaleString()} mi`
            )}
          </dd>
        </div>
      </dl>

      {(vinMissing || odoMissing) && !editing && (
        <p className="mt-2 text-xs text-slate-500">
          Identity ritual: VIN and odometer are operator-entered only — empty OBD evidence never
          invents them.
        </p>
      )}

      {!editing ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-sky-700 hover:underline"
          onClick={() => setEditing(true)}
        >
          Edit VIN / odometer
        </button>
      ) : (
        <form
          className="mt-3 space-y-2 border-t border-slate-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-600">
              VIN
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-sm"
                value={vinDraft}
                onChange={(e) => setVinDraft(e.target.value)}
                placeholder="Leave blank if unknown"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="block text-xs text-slate-600">
              Odometer (mi)
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                value={odoDraft}
                onChange={(e) => setOdoDraft(e.target.value)}
                inputMode="numeric"
                placeholder="Leave blank if unknown"
              />
            </label>
          </div>
          {save.isError && (
            <p className="text-xs text-red-700">
              {save.error instanceof Error ? save.error.message : "Save failed"}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save identity"}
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => {
                setEditing(false);
                setVinDraft(vehicle.vin ?? "");
                setOdoDraft(
                  vehicle.odometerMiles !== undefined ? String(vehicle.odometerMiles) : "",
                );
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
