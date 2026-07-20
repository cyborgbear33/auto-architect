import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EvidencePanels } from "../components/EvidencePanels.tsx";
import { EvidenceSourceBadge } from "../components/EvidenceSourceBadge.tsx";
import {
  EmptyVehicleState,
  PageHeader,
  useSelectedVehicleId,
  vehicleLabel,
} from "../components/Layout.tsx";
import { LiveGaugeStrip } from "../components/LiveGaugeStrip.tsx";
import { ReportDownload } from "../components/ReportDownload.tsx";
import { api, queryKeys } from "../lib/api.ts";
import { useAppSelector } from "../store/index.ts";

const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

function Pill({ children, tone = "normal" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCY_STYLES[tone] ?? URGENCY_STYLES.normal}`}
    >
      {children}
    </span>
  );
}

export function Dashboard() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleDashboard vehicleId={vehicleId} />;
}

function VehicleDashboard({ vehicleId }: { vehicleId: string }) {
  const debugMode = useAppSelector((s) => s.ui.debugMode);
  const qc = useQueryClient();

  const vehicleQ = useQuery({
    queryKey: queryKeys.vehicle(vehicleId),
    queryFn: () => api.getVehicle(vehicleId),
  });
  const dtcsQ = useQuery({
    queryKey: queryKeys.dtcs(vehicleId),
    queryFn: () => api.getDtcs(vehicleId),
  });
  const provenanceQ = useQuery({
    queryKey: queryKeys.evidenceProvenance(vehicleId),
    queryFn: () => api.getEvidenceProvenance(vehicleId),
  });
  const forecastQ = useQuery({
    queryKey: queryKeys.forecast(vehicleId),
    queryFn: () => api.getForecast(vehicleId),
  });
  const recognitionQ = useQuery({
    queryKey: queryKeys.recognition(vehicleId),
    queryFn: () => api.getRecognition(vehicleId),
  });
  const recommendationsQ = useQuery({
    queryKey: queryKeys.recommendations(vehicleId),
    queryFn: () => api.getRecommendations(vehicleId),
  });

  const vehicle = vehicleQ.data;

  return (
    <div>
      <PageHeader
        title={vehicle ? vehicleLabel(vehicle) : "Vehicle"}
        subtitle={vehicle ? `${vehicle.engineFamily} · ${vehicle.id}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportDownload vehicleId={vehicleId} />
            <button
              type="button"
              onClick={async () => {
                await api.refreshRecommendations(vehicleId);
                qc.invalidateQueries({ queryKey: queryKeys.recommendations(vehicleId) });
              }}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              Refresh recommendations
            </button>
          </div>
        }
      />

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <EvidenceSourceBadge provenance={provenanceQ.data} />
      </div>

      <div className="mb-4">
        <LiveGaugeStrip vehicleId={vehicleId} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Active DTCs</h2>
          {dtcsQ.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
          {dtcsQ.data?.length === 0 && (
            <p className="text-sm text-slate-400">
              No DTCs on file. Nothing to report — not the same as "healthy".
            </p>
          )}
          <ul className="space-y-1.5">
            {dtcsQ.data?.map((dtc) => (
              <li
                key={`${dtc.code}-${dtc.status}`}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-mono font-semibold text-slate-800">{dtc.code}</span>
                <span className="text-slate-500">{dtc.description ?? "—"}</span>
                <Pill
                  tone={
                    dtc.status === "permanent"
                      ? "critical"
                      : dtc.status === "pending"
                        ? "low"
                        : "high"
                  }
                >
                  {dtc.status}
                </Pill>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Oil-level trend</h2>
          {forecastQ.data && forecastQ.data.series.length < 2 ? (
            <p className="text-sm text-slate-400">
              Not enough oil-level samples yet to forecast (need ≥2).
            </p>
          ) : (
            <div>
              <Pill tone={forecastQ.data?.declining ? "high" : "normal"}>
                {forecastQ.data?.declining ? "Declining toward ADD mark" : "Stable"}
              </Pill>
              <p className="mt-2 text-xs text-slate-400">
                {forecastQ.data?.series.length ?? 0} sample(s) logged. Automated version of the W80
                1500–1700 mile dealer test.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Proven fault classes (LOGOS realize)
        </h2>
        {recognitionQ.data?.mostSpecific.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing proven from current evidence. That is an honest "not yet classified" — never a
            synthesized "Healthy".
          </p>
        ) : (
          <ul className="space-y-2">
            {recognitionQ.data?.mostSpecific.map((cls) => {
              const narr = recognitionQ.data?.narration?.find((n) => n.className === cls);
              return (
                <li key={cls} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <Pill tone="high">{cls}</Pill>
                  {narr && <p className="mt-1 text-xs text-slate-600">{narr.fluent}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {debugMode && recognitionQ.data?.undecided && recognitionQ.data.undecided.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Undecided (insufficient evidence either way): {recognitionQ.data.undecided.join(", ")}
          </p>
        )}
        <Link
          to="/diagnosis"
          className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline"
        >
          Go to full diagnosis →
        </Link>
      </section>

      <div className="mt-4">
        <EvidencePanels vehicleId={vehicleId} />
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recommendations</h2>
        {recommendationsQ.data?.length === 0 && (
          <p className="text-sm text-slate-400">No open recommendations.</p>
        )}
        <ul className="space-y-2">
          {recommendationsQ.data?.map((rec) => (
            <li key={rec.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{rec.title}</span>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {rec.confidence !== undefined && (
                    <span className="text-xs text-slate-500">
                      conf {(rec.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  <Pill tone={rec.priority}>{rec.priority}</Pill>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">{rec.reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
