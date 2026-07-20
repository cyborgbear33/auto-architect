import { useState } from "react";
import { api } from "../lib/api.ts";

/** Markdown / print HTML shop-note from the compose-only report API. */
export function ReportDownload({
  vehicleId,
  problemId,
}: {
  vehicleId?: string;
  problemId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadReport() {
    if (!vehicleId && !problemId) throw new Error("No vehicle or problem selected.");
    return problemId ? api.getProblemReport(problemId) : api.getVehicleReport(vehicleId!);
  }

  async function run(mode: "download" | "copy" | "print") {
    if (!vehicleId && !problemId) return;
    setBusy(true);
    setMessage(null);
    try {
      const report = await loadReport();
      const base = problemId
        ? `diagnostic-${problemId.replace(/[^a-zA-Z0-9_-]+/g, "_")}`
        : `diagnostic-${vehicleId!.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;

      if (mode === "copy") {
        await navigator.clipboard.writeText(report.markdown);
        setMessage("Copied Markdown to clipboard.");
      } else if (mode === "download") {
        const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Download started.");
      } else {
        const blob = new Blob([report.html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          // Popup blocked — fall back to downloading the HTML.
          const a = document.createElement("a");
          a.href = url;
          a.download = `${base}.html`;
          a.click();
          setMessage("Popup blocked — HTML report downloaded instead.");
        } else {
          setMessage("Opened print view — use the browser print dialog.");
        }
        // Revoke after the new tab has a chance to load.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => run("download")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Download report
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("print")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Print
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("copy")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Copy Markdown
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
