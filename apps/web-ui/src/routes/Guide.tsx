import type { MasteryGuide } from "@auto/semantic-types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyVehicleState, PageHeader, useSelectedVehicleId } from "../components/Layout.tsx";
import { MarkdownBody } from "../components/MarkdownBody.tsx";
import { api, queryKeys } from "../lib/api.ts";

export function Guide() {
  const vehicleId = useSelectedVehicleId();
  if (!vehicleId) return <EmptyVehicleState />;
  return <VehicleGuide vehicleId={vehicleId} />;
}

function VehicleGuide({ vehicleId }: { vehicleId: string }) {
  const guideQ = useQuery({
    queryKey: queryKeys.masteryGuide(vehicleId),
    queryFn: () => api.getMasteryGuide(vehicleId),
    retry: false,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (guideQ.data?.sections[0] && !activeId) {
      setActiveId(guideQ.data.sections[0].id);
    }
  }, [guideQ.data, activeId]);

  async function exportGuide(mode: "download" | "copy" | "print") {
    if (!guideQ.data) return;
    setBusy(true);
    setMessage(null);
    try {
      const guide = guideQ.data;
      const base = `mastery-guide-${vehicleId.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
      if (mode === "copy") {
        await navigator.clipboard.writeText(guide.markdown);
        setMessage("Copied Markdown to clipboard.");
      } else if (mode === "download") {
        const blob = new Blob([guide.markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Markdown download started.");
      } else {
        const blob = new Blob([guide.html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `${base}.html`;
          a.click();
          setMessage("Popup blocked — HTML downloaded. Open it and Print → Save as PDF.");
        } else {
          setMessage("Print view opened — use Print → Save as PDF for a PDF copy.");
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Guide"
        subtitle="Peace-of-mind mastery: vehicle → ontology → discovery → scan → diagnose → troubleshoot"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm text-sky-950">
        <span className="font-medium">Path:</span>
        <span className="text-sky-900/90">Know vehicle</span>
        <span aria-hidden className="text-sky-300">
          →
        </span>
        <Link
          to="/discovery"
          className="font-medium text-sky-700 underline-offset-2 hover:underline"
        >
          Discovery
        </Link>
        <span aria-hidden className="text-sky-300">
          →
        </span>
        <Link to="/" className="font-medium text-sky-700 underline-offset-2 hover:underline">
          Dashboard
        </Link>
        <span aria-hidden className="text-sky-300">
          →
        </span>
        <Link
          to="/diagnosis"
          className="font-medium text-sky-700 underline-offset-2 hover:underline"
        >
          Diagnosis
        </Link>
      </div>

      {guideQ.isLoading && <p className="text-sm text-slate-400">Loading guide…</p>}
      {guideQ.error && (
        <p className="text-sm text-rose-600">
          {guideQ.error instanceof Error ? guideQ.error.message : "Failed to load guide."}
        </p>
      )}

      {guideQ.data && (
        <>
          <ExportBar
            busy={busy}
            message={message}
            onDownload={() => void exportGuide("download")}
            onCopy={() => void exportGuide("copy")}
            onPrint={() => void exportGuide("print")}
          />
          <GuideLayout
            guide={guideQ.data}
            activeId={activeId ?? guideQ.data.sections[0]?.id ?? null}
            onSelect={setActiveId}
          />
        </>
      )}
    </div>
  );
}

function ExportBar({
  busy,
  message,
  onDownload,
  onCopy,
  onPrint,
}: {
  busy: boolean;
  message: string | null;
  onDownload: () => void;
  onCopy: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onDownload}
        className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        Download Markdown
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onPrint}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Print / Save PDF
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCopy}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Copy Markdown
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}

function GuideLayout({
  guide,
  activeId,
  onSelect,
}: {
  guide: MasteryGuide;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = guide.sections.find((s) => s.id === activeId) ?? guide.sections[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <nav
        aria-label="Guide chapters"
        className="h-fit rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-4"
      >
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Chapters
        </div>
        <ul className="space-y-0.5">
          {guide.sections.map((section, idx) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                  section.id === active?.id
                    ? "bg-sky-50 font-medium text-sky-800"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="mr-1.5 font-mono text-[10px] text-slate-400">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {active && (
          <>
            <h2 className="text-lg font-semibold text-slate-900">{active.title}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {guide.title} · updated {new Date(guide.generatedAt).toLocaleString()}
            </p>
            <div className="mt-4">
              <MarkdownBody markdown={active.markdown} />
            </div>
            <ChapterPager guide={guide} activeId={active.id} onSelect={onSelect} />
          </>
        )}
      </article>
    </div>
  );
}

function ChapterPager({
  guide,
  activeId,
  onSelect,
}: {
  guide: MasteryGuide;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const idx = guide.sections.findIndex((s) => s.id === activeId);
  const prev = idx > 0 ? guide.sections[idx - 1] : null;
  const next = idx >= 0 && idx < guide.sections.length - 1 ? guide.sections[idx + 1] : null;
  return (
    <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
      {prev ? (
        <button
          type="button"
          onClick={() => onSelect(prev.id)}
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          ← {prev.title}
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          type="button"
          onClick={() => onSelect(next.id)}
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          {next.title} →
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
