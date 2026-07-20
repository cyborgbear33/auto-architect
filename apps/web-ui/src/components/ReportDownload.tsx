import { useState } from "react";
import { api } from "../lib/api.ts";

/** Markdown shop-note download / clipboard copy from the compose-only report API. */
export function ReportDownload({
  vehicleId,
  problemId,
}: {
  vehicleId?: string;
  problemId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(mode: "download" | "copy") {
    if (!vehicleId && !problemId) return;
    setBusy(true);
    setMessage(null);
    try {
      const report = problemId
        ? await api.getProblemReport(problemId)
        : await api.getVehicleReport(vehicleId!);
      if (mode === "copy") {
        await navigator.clipboard.writeText(report.markdown);
        setMessage("Copied Markdown to clipboard.");
      } else {
        const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = problemId
          ? `diagnostic-${problemId.replace(/[^a-zA-Z0-9_-]+/g, "_")}.md`
          : `diagnostic-${vehicleId!.replace(/[^a-zA-Z0-9_-]+/g, "_")}.md`;
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
        onClick={() => run("copy")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Copy Markdown
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
