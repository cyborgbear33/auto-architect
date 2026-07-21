import type { CascadeBand, CascadeWatchItem } from "@auto/semantic-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, queryKeys } from "../lib/api.ts";

const BAND_STYLES: Record<CascadeBand, string> = {
  High: "border-red-200 bg-red-50 text-red-900",
  Elevated: "border-amber-200 bg-amber-50 text-amber-950",
  Watch: "border-slate-200 bg-slate-50 text-slate-700",
};

function BandPill({ band }: { band: CascadeBand }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${BAND_STYLES[band]}`}
    >
      {band}
    </span>
  );
}

function WatchRow({ item }: { item: CascadeWatchItem }) {
  return (
    <li className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <BandPill band={item.band} />
        <span className="font-medium text-slate-800">{item.consequentClass}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{item.rationale}</p>
      {item.horizon && <p className="mt-1 text-[11px] text-slate-500">Horizon: {item.horizon}</p>}
      <ul className="mt-1.5 list-inside list-disc text-[11px] text-slate-500">
        {item.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="mt-1 font-mono text-[10px] text-slate-400">
        via {item.matchedAntecedent.kind}:{item.matchedAntecedent.id}
      </p>
    </li>
  );
}

/**
 * F7/F8 — on-command “what may go next” watchlist from curated cascade edges,
 * including operator-entered mechanical wear stages. Ordinal bands only.
 */
export function CascadePrognosisPanel({ vehicleId }: { vehicleId: string }) {
  const qc = useQueryClient();
  const prognosis = useQuery({
    queryKey: queryKeys.cascadePrognosis(vehicleId),
    queryFn: () => api.getCascadePrognosis(vehicleId),
  });
  const vehicle = useQuery({
    queryKey: queryKeys.vehicle(vehicleId),
    queryFn: () => api.getVehicle(vehicleId),
  });
  const catalog = useQuery({
    queryKey: queryKeys.manualConditions(),
    queryFn: () => api.listManualConditions(),
  });

  const activeIds = useMemo(
    () => new Set((vehicle.data?.manualConditions ?? []).map((c) => c.id)),
    [vehicle.data?.manualConditions],
  );
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const selected = draft ?? activeIds;

  const save = useMutation({
    mutationFn: async (ids: string[]) =>
      api.setManualConditions(vehicleId, {
        conditions: ids.map((id) => ({ id })),
      }),
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.vehicle(vehicleId) }),
        qc.invalidateQueries({ queryKey: queryKeys.cascadePrognosis(vehicleId) }),
      ]);
    },
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  }

  const dirty =
    draft !== null &&
    (draft.size !== activeIds.size || [...draft].some((id) => !activeIds.has(id)));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Likely next (cascade watch)</h2>
      <p className="mb-3 text-xs text-slate-400">
        Curated shop cascades from proven classes, flagged trends, open cases, and operator-entered
        wear stages — ordinal bands only, not probabilities. Does not invent fault membership.
      </p>

      <div className="mb-4 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Mechanical conditions (operator)
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Inspected wear only — never inferred from the bus. Saving refreshes the watchlist.
        </p>
        {catalog.isLoading && <p className="mt-2 text-xs text-slate-400">Loading catalog…</p>}
        {catalog.data && (
          <ul className="mt-2 space-y-1.5">
            {catalog.data.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    disabled={save.isPending}
                  />
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {c.description && (
                      <span className="block text-[11px] text-slate-500">{c.description}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate([...selected])}
          >
            {save.isPending ? "Saving…" : "Save conditions"}
          </button>
          {dirty && (
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-700"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              Reset
            </button>
          )}
          {save.isError && (
            <span className="text-xs text-red-600">
              {(save.error as Error).message || "Save failed"}
            </span>
          )}
        </div>
      </div>

      {prognosis.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {prognosis.data && prognosis.data.items.length === 0 && (
        <p className="text-sm text-slate-400">
          {prognosis.data.emptyReason ?? "Nothing on the watchlist."}
        </p>
      )}
      {prognosis.data && prognosis.data.items.length > 0 && (
        <ul className="space-y-2">
          {prognosis.data.items.map((item) => (
            <WatchRow key={item.edgeId} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
