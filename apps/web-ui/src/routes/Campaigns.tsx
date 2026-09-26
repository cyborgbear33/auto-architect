import { useQuery } from "@tanstack/react-query";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api, queryKeys } from "../lib/api.ts";

export function Campaigns() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleCampaigns vehicleId={vehicleId} />;
}

function VehicleCampaigns({ vehicleId }: { vehicleId: string }) {
  const campaignsQ = useQuery({
    queryKey: queryKeys.campaigns(vehicleId),
    queryFn: () => api.getCampaigns(vehicleId),
  });

  return (
    <div>
      <PageHeader
        title="Recalls & TSBs"
        subtitle="Curated recalls and bulletins that match this vehicle. A match is not a proven fault."
      />

      {campaignsQ.isLoading && (
        <p className="text-sm text-slate-400">Loading recalls and bulletins…</p>
      )}
      {campaignsQ.isError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load recalls and bulletins. Check that the API is running, then refresh.
        </p>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Recalls / Customer Satisfaction Notifications
        </h2>
        {campaignsQ.data?.campaigns.length === 0 && (
          <p className="text-sm text-slate-500">
            No curated recall matched this vehicle. That only means the list had no hit — not that
            the vehicle is clear.
          </p>
        )}
        <ul className="space-y-3">
          {campaignsQ.data?.campaigns.map((c) => (
            <li key={c.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  {c.id}: {c.title}
                </span>
                <span className="text-xs text-slate-400">
                  {c.yearRange[0]}–{c.yearRange[1]}
                </span>
              </div>
              <p className="mt-1 text-slate-600">{c.summary}</p>
              <p className="mt-1 text-xs text-slate-500">
                Matched on engine family and model years {c.yearRange[0]}–{c.yearRange[1]}.
                {c.sourceType === "primary"
                  ? " Checked against the source."
                  : c.sourceType === "corroborated"
                    ? " Corroborated — not read from the original document."
                    : ""}
              </p>
              {c.reference && <p className="mt-1 text-xs text-slate-400">Ref: {c.reference}</p>}
              {c.source?.startsWith("http") && (
                <a
                  href={c.source}
                  className="mt-1 inline-block text-xs font-medium text-sky-700 underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Technical Service Bulletins</h2>
        {campaignsQ.data?.tsbs.length === 0 && (
          <p className="text-sm text-slate-500">No curated bulletin matched this engine family.</p>
        )}
        <ul className="space-y-3">
          {campaignsQ.data?.tsbs.map((t) => (
            <li key={t.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <span className="font-semibold text-slate-800">
                {t.id}: {t.title}
              </span>
              <p className="mt-1 text-slate-600">{t.summary}</p>
              <p className="mt-1 text-xs text-slate-500">
                Matched on engine family.
                {t.sourceType === "primary"
                  ? " Checked against the source."
                  : t.sourceType === "corroborated"
                    ? " Corroborated — not read from the original document."
                    : ""}
              </p>
              {t.reference && <p className="mt-1 text-xs text-slate-400">Ref: {t.reference}</p>}
              {t.source?.startsWith("http") && (
                <a
                  href={t.source}
                  className="mt-1 inline-block text-xs font-medium text-sky-700 underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
