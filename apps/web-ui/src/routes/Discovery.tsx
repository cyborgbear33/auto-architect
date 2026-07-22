import type {
  DiscoveryForensicsReport,
  DiscoveryPidRow,
  DiscoverySupportStatus,
} from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { ApiError, api, queryKeys } from "../lib/api.ts";

type Mode01Filter = "all" | "supported" | "unsupported" | "unknown" | "unmapped" | "cartridge";

export function Discovery() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleDiscovery vehicleId={vehicleId} />;
}

function VehicleDiscovery({ vehicleId }: { vehicleId: string }) {
  const discoveryQ = useQuery({
    queryKey: queryKeys.discovery(vehicleId),
    queryFn: () => api.getDiscovery(vehicleId),
    retry: false,
  });
  const [mode01Filter, setMode01Filter] = useState<Mode01Filter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const missing = discoveryQ.error instanceof ApiError && discoveryQ.error.statusCode === 404;

  const filteredMode01 = useMemo(() => {
    const rows = discoveryQ.data?.mode01 ?? [];
    switch (mode01Filter) {
      case "supported":
        return rows.filter((r) => r.support === "supported");
      case "unsupported":
        return rows.filter((r) => r.support === "unsupported");
      case "unknown":
        return rows.filter((r) => r.support === "unknown" || r.support === "manual_only");
      case "unmapped":
        return rows.filter((r) => r.support === "supported" && !r.inOntology);
      case "cartridge":
        return rows.filter((r) => r.cartridgeRelevant);
      default:
        return rows;
    }
  }, [discoveryQ.data?.mode01, mode01Filter]);

  async function downloadReport(mode: "download" | "copy") {
    setBusy(true);
    setMessage(null);
    try {
      const report = await api.getDiscoveryReport(vehicleId);
      if (mode === "copy") {
        await navigator.clipboard.writeText(report.markdown);
        setMessage("Copied Markdown to clipboard.");
      } else {
        const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `discovery-${vehicleId.replace(/[^a-zA-Z0-9_-]+/g, "_")}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Download started.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Discovery"
        subtitle="Vehicle intelligence — what this ECU + OBDLink MX+ can expose, mapped to ontology"
      />

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Lawful observe boundary</p>
        <p className="mt-1 text-slate-600">
          Discovery maps Mode 01–07 support bits and ontology links from what the adapter can
          report. It is not a full OEM CAN/UDS module tree (FORScan-style maps stay out of
          scope) — grow depth from evidence, not invented bus matrices.
        </p>
      </div>

      {discoveryQ.isLoading && <p className="text-sm text-slate-400">Loading discovery…</p>}

      {missing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">No discovery report yet.</p>
          <p className="mt-2 text-amber-900/90">
            Run a support probe from the gateway (live or simulated), then refresh this page:
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-white/80 p-3 font-mono text-xs text-slate-700">
            {`python -m obd_gateway --vehicle-id ${vehicleId} --simulate --dry-run discover\npython -m obd_gateway --vehicle-id ${vehicleId} discover`}
          </pre>
          <p className="mt-2 text-xs text-amber-800/80">
            New here? Open the{" "}
            <Link to="/guide" className="font-medium text-amber-950 underline underline-offset-2">
              Guide
            </Link>{" "}
            for the full vehicle → ontology → discovery path (print / Markdown export included).
          </p>
        </div>
      )}

      {discoveryQ.data && (
        <>
          <ContextPanel report={discoveryQ.data} />
          <SummaryStrip report={discoveryQ.data} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadReport("download")}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Download report
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadReport("copy")}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Copy Markdown
            </button>
            {message && <span className="text-xs text-slate-500">{message}</span>}
          </div>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-800">What this means</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {discoveryQ.data.narrative.map((line) => (
                <li key={line.slice(0, 48)}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-800">Mode 01 PIDs</h2>
              <label className="text-xs text-slate-500">
                Filter{" "}
                <select
                  value={mode01Filter}
                  onChange={(e) => setMode01Filter(e.target.value as Mode01Filter)}
                  className="ml-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                >
                  <option value="all">All</option>
                  <option value="supported">Available</option>
                  <option value="unsupported">Unsupported</option>
                  <option value="unknown">Unknown / manual</option>
                  <option value="unmapped">Unmapped (ECU yes, ontology no)</option>
                  <option value="cartridge">Cartridge-relevant</option>
                </select>
              </label>
            </div>
            <Mode01Table rows={filteredMode01} />
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-800">Mode 06 MIDs</h2>
            <Mode06Table report={discoveryQ.data} />
          </section>
        </>
      )}
    </div>
  );
}

function ContextPanel({ report }: { report: DiscoveryForensicsReport }) {
  const v = report.vehicle;
  const c = report.hardware.connection;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900">
            {v.year ?? "?"} {v.make} {v.model}
            {v.trim ? ` ${v.trim}` : ""}
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">{report.vehicleId}</div>
          <div className="mt-2 text-sm text-slate-600">
            Engine family <span className="font-mono text-xs">{v.engineFamily}</span>
            {v.profileObdProtocol ? (
              <>
                {" "}
                · Profile protocol <span className="font-mono text-xs">{v.profileObdProtocol}</span>
              </>
            ) : null}
          </div>
        </div>
        <SourceBadge source={report.source} capturedAt={report.capturedAt} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Kv label="Connected" value={c.connected ? "yes" : "no"} />
        <Kv label="Port" value={c.port ?? "—"} mono />
        <Kv label="Protocol" value={c.protocolName ?? "—"} />
        <Kv label="Adapter" value={report.hardware.preferredAdapter} />
      </dl>
      {report.hardware.adapterNotes.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {report.hardware.adapterNotes.map((n) => (
            <li key={n.slice(0, 40)}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SummaryStrip({ report }: { report: DiscoveryForensicsReport }) {
  const s = report.summary;
  const cells = [
    { label: "Mode 01 supported", value: String(s.mode01Supported) },
    { label: "Mode 01 unsupported", value: String(s.mode01Unsupported) },
    { label: "Mode 01 unknown", value: String(s.mode01Unknown) },
    { label: "Mode 06 supported", value: String(s.mode06Supported) },
    { label: "Freeze frame", value: flagText(s.freezeFrame) },
    { label: "VIN", value: flagText(s.vin) },
    { label: "Unmapped", value: String(s.unmappedSupportedPids) },
    { label: "Cartridge avail.", value: String(s.cartridgeRelevantAvailable) },
  ];
  return (
    <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{cell.label}</div>
          <div className="mt-0.5 text-lg font-semibold text-slate-800">{cell.value}</div>
        </div>
      ))}
    </section>
  );
}

function Mode01Table({ rows }: { rows: DiscoveryPidRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-slate-400">No rows match this filter.</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">PID</th>
            <th className="px-3 py-2 font-medium">Support</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pid} className="border-b border-slate-50 last:border-0">
              <td className="px-3 py-2 font-mono text-xs text-slate-800">
                {row.pid}
                {row.pidHex ? <span className="ml-1 text-slate-400">{row.pidHex}</span> : null}
              </td>
              <td className="px-3 py-2">
                <SupportPill support={row.support} />
              </td>
              <td className="px-3 py-2 text-slate-600">{row.unit ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{row.description ?? "—"}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {row.inOntology ? <Tag>ontology</Tag> : <Tag tone="warn">unmapped</Tag>}
                  {row.inDefaultPoll && <Tag>default poll</Tag>}
                  {row.cartridgeRelevant && <Tag>cartridge</Tag>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mode06Table({ report }: { report: DiscoveryForensicsReport }) {
  const rows = report.mode06;
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-slate-400">No Mode 06 rows.</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">MID</th>
            <th className="px-3 py-2 font-medium">Support</th>
            <th className="px-3 py-2 font-medium">Concept</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.mid} className="border-b border-slate-50 last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{row.mid}</td>
              <td className="px-3 py-2">
                <SupportPill support={row.support} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.concept ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{row.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupportPill({ support }: { support: DiscoverySupportStatus }) {
  const tone =
    support === "supported"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : support === "unsupported"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : support === "manual_only"
          ? "border-slate-200 bg-slate-100 text-slate-700"
          : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {support.replace("_", " ")}
    </span>
  );
}

function Tag({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "warn" }) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function SourceBadge({ source, capturedAt }: { source: string; capturedAt: string }) {
  const tone =
    source === "obd_gateway"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-md border px-2.5 py-1.5 text-xs ${tone}`}>
      <div className="font-semibold">{source === "obd_gateway" ? "Live OBD" : source}</div>
      <div className="mt-0.5 opacity-80">{new Date(capturedAt).toLocaleString()}</div>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function flagText(flag: boolean | null): string {
  if (flag === true) return "yes";
  if (flag === false) return "no";
  return "?";
}
