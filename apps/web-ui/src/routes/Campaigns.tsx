import { useQuery } from "@tanstack/react-query";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { api } from "../lib/api.ts";

export function Campaigns() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleCampaigns vehicleId={vehicleId} />;
}

function VehicleCampaigns({ vehicleId }: { vehicleId: string }) {
  const campaignsQ = useQuery({
    queryKey: ["campaigns", vehicleId],
    queryFn: () => api.getCampaigns(vehicleId),
  });

  return (
    <div>
      <PageHeader
        title="Recalls & TSBs"
        subtitle="Matched against this vehicle's engine family + model year"
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Recalls / Customer Satisfaction Notifications
        </h2>
        {campaignsQ.data?.campaigns.length === 0 && (
          <p className="text-sm text-slate-400">No matching campaigns found for this vehicle.</p>
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
              {c.reference && <p className="mt-1 text-xs text-slate-400">Ref: {c.reference}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Technical Service Bulletins</h2>
        {campaignsQ.data?.tsbs.length === 0 && (
          <p className="text-sm text-slate-400">No matching TSBs found for this engine family.</p>
        )}
        <ul className="space-y-3">
          {campaignsQ.data?.tsbs.map((t) => (
            <li key={t.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <span className="font-semibold text-slate-800">
                {t.id}: {t.title}
              </span>
              <p className="mt-1 text-slate-600">{t.summary}</p>
              {t.reference && <p className="mt-1 text-xs text-slate-400">Ref: {t.reference}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
