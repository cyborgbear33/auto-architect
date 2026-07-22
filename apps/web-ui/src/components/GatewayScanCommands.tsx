import { useState } from "react";

/** Copyable gateway CLI for live MX+ / dry-run — browser never talks to the adapter. */
export function gatewayScanCommands(vehicleId: string): {
  id: string;
  label: string;
  detail: string;
  command: string;
}[] {
  const vid = vehicleId || "veh:YOUR-VEHICLE-ID";
  return [
    {
      id: "dry-run",
      label: "Dry-run simulate scan",
      detail: "No hardware — print batch JSON (includes imStatus / Mode 0A when enabled).",
      command: [
        "cd apps/obd-gateway",
        `python -m obd_gateway --vehicle-id ${vid} \\`,
        "  --simulate --dry-run \\",
        "  --simulate-dtc P0304:stored \\",
        "  scan",
      ].join("\n"),
    },
    {
      id: "live-scan",
      label: "Live MX+ scan → API",
      detail: "Ignition ON; pair adapter first. Posts observations (source: obd_gateway).",
      command: [
        "cd apps/obd-gateway",
        `python -m obd_gateway --vehicle-id ${vid} scan`,
      ].join("\n"),
    },
    {
      id: "watch",
      label: "Live watch (drive)",
      detail: "Continuous poll during a trip; refresh Dashboard for gauges / readiness.",
      command: [
        "cd apps/obd-gateway",
        `python -m obd_gateway --vehicle-id ${vid} watch --interval 5`,
      ].join("\n"),
    },
  ];
}

/**
 * S1 Dashboard affordance — gateway scan/watch/dry-run commands on the
 * evidence ritual. Does not shell out; live path stays CLI until a future
 * operator-host bridge exists.
 */
export function GatewayScanCommands({ vehicleId }: { vehicleId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const rows = gatewayScanCommands(vehicleId);

  async function copy(id: string, command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div id="gateway-scan" className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Live MX+ / gateway (S1)
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        This UI cannot reach Bluetooth/USB adapters. Run these from{" "}
        <code className="rounded bg-slate-100 px-1">apps/obd-gateway</code> with the same vehicle
        id, then refresh — never invent a live scan from the browser.
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700">{row.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{row.detail}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => void copy(row.id, row.command)}
              >
                {copied === row.id ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-white/90 p-2 font-mono text-[11px] leading-relaxed text-slate-700">
              {row.command}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
