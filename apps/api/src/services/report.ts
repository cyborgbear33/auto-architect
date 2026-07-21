/**
 * Compose-only diagnostic shop note. Never mutates store state and never
 * invents fault classes — only aggregates existing read models.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  DriveSessionSummary,
  EvidenceProvenance,
  LearningCycle,
  Recognition,
  Recommendation,
  SolutionHistory,
  VehicleProfile,
} from "@auto/semantic-types";
import type { ActionService } from "./actions.ts";
import type { CampaignService } from "./campaigns.ts";
import type { DriveSessionService } from "./drive-sessions.ts";
import type { LearningCycleService } from "./learning-cycles.ts";
import type { ObservationService } from "./observations.ts";
import type { RecognitionService } from "./recognition.ts";
import type { RecommendationService } from "./recommendations.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

export interface DiagnosticReport {
  scope: "vehicle" | "problem";
  vehicleId: string;
  problemId?: string;
  generatedAt: string;
  markdown: string;
  /** Print-friendly HTML (same content as markdown) with embedded stylesheet. */
  html: string;
  /** Most recent drive session rollup, when any session exists. */
  lastSession: DriveSessionSummary | null;
}

export class ReportService {
  constructor(
    private vehicles: VehicleService,
    private observations: ObservationService,
    private recognition: RecognitionService,
    private recommendations: RecommendationService,
    private actions: ActionService,
    private campaigns: CampaignService,
    private driveSessions: DriveSessionService,
    private learningCycles: LearningCycleService,
    private solutionHistory: SolutionHistoryService,
  ) {}

  async forVehicle(vehicleId: string): Promise<DiagnosticReport> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const [
      provenance,
      recognition,
      problems,
      decisions,
      recommendations,
      campaignPack,
      lastSession,
      cycleList,
      history,
    ] = await Promise.all([
      this.observations.provenance(vehicleId),
      this.recognition.recognize(vehicleId),
      this.actions.listDiagnosticProblems(vehicleId),
      this.actions.listDecisions(vehicleId),
      this.recommendations.list(vehicleId),
      this.campaigns.forVehicle(vehicleId),
      this.driveSessions.summarizeLast(vehicleId),
      this.learningCycles.forVehicle(vehicleId),
      this.solutionHistory.forVehicle(vehicleId),
    ]);
    const markdown = composeMarkdown({
      scope: "vehicle",
      vehicle,
      provenance,
      recognition,
      problems,
      decisions,
      recommendations,
      campaigns: campaignPack.campaigns.map((c) => c.title),
      tsbs: campaignPack.tsbs.map((t) => t.title),
      lastSession,
      cycles: cycleList.cycles.slice(0, 8),
      solutionHistory: history,
    });
    return wrapReport("vehicle", vehicleId, undefined, markdown, lastSession);
  }

  async forProblem(problemId: string): Promise<DiagnosticReport> {
    const problem = await this.actions.getDiagnosticProblem(problemId);
    const vehicle = await this.vehicles.getOrThrow(problem.vehicleId);
    const [provenance, recognition, decisions, recommendations, lastSession, cycleList, history] =
      await Promise.all([
        this.observations.provenance(problem.vehicleId),
        this.recognition.recognize(problem.vehicleId),
        this.actions.listDecisions(problem.vehicleId),
        this.recommendations.list(problem.vehicleId),
        this.driveSessions.summarizeLast(problem.vehicleId),
        this.learningCycles.forVehicle(problem.vehicleId, problemId),
        this.solutionHistory.forVehicle(problem.vehicleId, problem.triggeredByClass),
      ]);
    const relatedDecisions = decisions.filter((d) => d.problemId === problemId);
    const markdown = composeMarkdown({
      scope: "problem",
      vehicle,
      provenance,
      recognition,
      problems: [problem],
      decisions: relatedDecisions,
      recommendations: recommendations.filter((r) =>
        r.generatedFromClasses.includes(problem.triggeredByClass ?? ""),
      ),
      campaigns: [],
      tsbs: [],
      focusProblemId: problemId,
      lastSession,
      cycles: cycleList.cycles,
      solutionHistory: history,
    });
    return wrapReport("problem", problem.vehicleId, problemId, markdown, lastSession);
  }
}

function wrapReport(
  scope: "vehicle" | "problem",
  vehicleId: string,
  problemId: string | undefined,
  markdown: string,
  lastSession: DriveSessionSummary | null,
): DiagnosticReport {
  return {
    scope,
    vehicleId,
    problemId,
    generatedAt: new Date().toISOString(),
    markdown,
    html: markdownToPrintHtml(markdown),
    lastSession,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export type MarkdownPrintOptions = {
  /** Document <title> and optional print chrome. */
  title?: string;
};

/** Minimal Markdown → print HTML for shop notes and the mastery guide. */
export function markdownToPrintHtml(markdown: string, opts: MarkdownPrintOptions = {}): string {
  const docTitle = opts.title ?? "Diagnostic report";
  const blocks: string[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  let inCode = false;
  const codeLines: string[] = [];

  const flushCode = () => {
    if (!inCode) return;
    blocks.push(`<pre><code>${esc(codeLines.join("\n"))}</code></pre>`);
    codeLines.length = 0;
    inCode = false;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      if (inCode) flushCode();
      else inCode = true;
      i += 1;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      i += 1;
      continue;
    }

    if (line.startsWith("|") && line.includes("|") && lines[i + 1]?.match(/^\|?\s*[-:| ]+\s*\|/)) {
      const tableRows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("|")) {
        tableRows.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push(renderMarkdownTable(tableRows));
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      blocks.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      blocks.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line === "---") {
      blocks.push("<hr />");
    } else if (line.startsWith("> ")) {
      blocks.push(`<blockquote><p>${inlineFormat(line.slice(2))}</p></blockquote>`);
    } else if (/^\d+\.\s+/.test(line)) {
      blocks.push(`<li class="ol">${inlineFormat(line.replace(/^\d+\.\s+/, ""))}</li>`);
    } else if (line.startsWith("- ")) {
      blocks.push(`<li>${inlineFormat(line.slice(2))}</li>`);
    } else if (line.startsWith("  - ")) {
      blocks.push(`<li class="nested">${inlineFormat(line.slice(4))}</li>`);
    } else if (line.trim() === "") {
      blocks.push("");
    } else if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
      blocks.push(`<p class="footnote"><em>${inlineFormat(line.slice(1, -1))}</em></p>`);
    } else {
      blocks.push(`<p>${inlineFormat(line)}</p>`);
    }
    i += 1;
  }
  flushCode();

  // Wrap consecutive <li> into <ul> / <ol>
  const htmlBody: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  for (const b of blocks) {
    const isOl = b.startsWith('<li class="ol"');
    const isUl = b.startsWith("<li") && !isOl;
    if (isOl || isUl) {
      const kind = isOl ? "ol" : "ul";
      if (listKind !== kind) {
        if (listKind) htmlBody.push(`</${listKind}>`);
        htmlBody.push(`<${kind}>`);
        listKind = kind;
      }
      htmlBody.push(isOl ? b.replace(' class="ol"', "") : b);
    } else {
      if (listKind) {
        htmlBody.push(`</${listKind}>`);
        listKind = null;
      }
      htmlBody.push(b);
    }
  }
  if (listKind) htmlBody.push(`</${listKind}>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(docTitle)}</title>
<style>
  :root { color-scheme: light; }
  body {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #1a1a1a;
    max-width: 720px;
    margin: 1.5rem auto;
    padding: 0 1.25rem 2rem;
  }
  h1 { font-size: 1.55rem; margin: 0 0 0.75rem; font-weight: 650; }
  h2 {
    font-size: 1.05rem;
    margin: 1.4rem 0 0.45rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #ccc;
    font-weight: 650;
  }
  h3 { font-size: 1rem; margin: 1rem 0 0.35rem; font-weight: 600; }
  p { margin: 0.35rem 0; }
  ul { margin: 0.35rem 0 0.6rem; padding-left: 1.25rem; }
  li { margin: 0.15rem 0; }
  li.nested { margin-left: 0.75rem; list-style-type: circle; }
  code {
    font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace;
    font-size: 0.9em;
    background: #f3f3f3;
    padding: 0.05em 0.3em;
    border-radius: 3px;
  }
  hr { border: none; border-top: 1px solid #bbb; margin: 1.25rem 0; }
  .footnote { color: #555; font-size: 0.9rem; margin-top: 1rem; }
  .no-print {
    margin: 0 0 1rem;
    font-family: system-ui, sans-serif;
    font-size: 0.85rem;
  }
  pre {
    font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace;
    font-size: 0.85em;
    background: #f4f4f4;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.65rem 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0 0.75rem;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 0.3rem 0.45rem;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f3f3f3; font-weight: 650; }
  blockquote {
    margin: 0.5rem 0;
    padding: 0.35rem 0.75rem;
    border-left: 3px solid #999;
    color: #333;
    background: #fafafa;
  }
  ol { margin: 0.35rem 0 0.6rem; padding-left: 1.25rem; }
  @media print {
    body { margin: 0; max-width: none; padding: 0.4in 0.6in; }
    .no-print { display: none !important; }
    h2 { break-after: avoid; }
    ul, ol, p, table { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
  @page { margin: 0.6in; }
</style>
</head>
<body>
<p class="no-print">Print this page (Ctrl/Cmd+P), or use your browser’s <strong>Save as PDF</strong>. Close the tab when done.</p>
<article class="report">
${htmlBody.join("\n")}
</article>
</body>
</html>`;
}

function renderMarkdownTable(rows: string[]): string {
  const cells = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const bodyRows = rows.filter((r) => !/^\|?\s*[-:| ]+\s*\|/.test(r));
  if (bodyRows.length === 0) return "";
  const [header, ...rest] = bodyRows;
  const headCells = cells(header ?? "");
  const thead = `<thead><tr>${headCells.map((c) => `<th>${inlineFormat(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rest
    .map(
      (r) =>
        `<tr>${cells(r)
          .map((c) => `<td>${inlineFormat(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function appendLastSessionSection(lines: string[], summary: DriveSessionSummary | null): void {
  lines.push("## Last drive session");
  if (!summary) {
    lines.push("No drive sessions on file.");
    lines.push("");
    return;
  }
  const s = summary.session;
  lines.push(`- **Id:** \`${s.id}\``);
  if (s.label) lines.push(`- **Label:** ${s.label}`);
  lines.push(`- **Source:** ${s.source}${summary.open ? " (in progress)" : ""}`);
  lines.push(`- **Started:** ${s.startedAt}`);
  if (s.endedAt) lines.push(`- **Ended:** ${s.endedAt}`);
  if (summary.durationSec !== undefined) {
    lines.push(`- **Duration:** ${formatDuration(summary.durationSec)}`);
  }
  lines.push(`- **Batches:** ${summary.batchCount}`);
  if (s.odometerStartMiles !== undefined || s.odometerEndMiles !== undefined) {
    const start = s.odometerStartMiles !== undefined ? `${s.odometerStartMiles}` : "?";
    const end = s.odometerEndMiles !== undefined ? `${s.odometerEndMiles}` : "?";
    lines.push(`- **Odometer:** ${start} → ${end} mi`);
  }
  if (summary.dtcCodes.length > 0) {
    lines.push(`- **DTCs seen:** ${summary.dtcCodes.join(", ")}`);
  } else {
    lines.push("- **DTCs seen:** none");
  }
  const peaks: string[] = [];
  if (summary.maxRpm !== undefined) peaks.push(`RPM ${summary.maxRpm}`);
  if (summary.maxEngineLoad !== undefined) peaks.push(`load ${summary.maxEngineLoad}%`);
  if (summary.maxShortFuelTrim1 !== undefined) {
    peaks.push(`STFT ${summary.maxShortFuelTrim1}%`);
  }
  if (peaks.length > 0) lines.push(`- **PID peaks:** ${peaks.join(", ")}`);
  if (summary.coolantMinC !== undefined && summary.coolantMaxC !== undefined) {
    lines.push(`- **Coolant:** ${summary.coolantMinC}–${summary.coolantMaxC} °C`);
  }
  if (summary.freezeFrameCount > 0) {
    lines.push(`- **Freeze frames:** ${summary.freezeFrameCount}`);
  }
  if (summary.mode06Count > 0) {
    lines.push(`- **Mode 06 results:** ${summary.mode06Count}`);
  }
  lines.push("");
}

function appendLearningSection(
  lines: string[],
  cycles: LearningCycle[],
  history: SolutionHistory | null,
): void {
  lines.push("## Learning");
  if (cycles.length === 0 && (!history || history.vehicle.length === 0)) {
    lines.push("No learning cycles or solution outcomes on file yet.");
    lines.push("");
    return;
  }
  if (cycles.length > 0) {
    lines.push("### Learning cycles");
    for (const c of cycles) {
      const classBit = c.faultClass ? ` (${c.faultClass})` : "";
      const outcomeBit = c.outcome ? ` — outcome ${c.outcome.status}` : "";
      const priorBit = c.priorDelta
        ? ` — prior n=${c.priorDelta.sampleSize} (${c.priorDelta.scope})`
        : "";
      lines.push(`- \`${c.id}\` ${c.status}${classBit}${outcomeBit}${priorBit}`);
      if (c.priorDelta?.explain) lines.push(`  - ${c.priorDelta.explain}`);
    }
    lines.push("");
  }
  if (history && history.vehicle.length > 0) {
    lines.push("### What worked (this vehicle)");
    for (const b of history.vehicle.slice(0, 8)) {
      const n = b.totalWithOutcome;
      const advisory = n < 2 ? " — small sample, advisory" : "";
      lines.push(
        `- \`${b.actionId}\` / ${b.faultClass ?? "?"} — worked ${b.worked}, failed ${b.failed}, n=${n}${advisory}`,
      );
    }
    lines.push("");
  }
}

function composeMarkdown(input: {
  scope: "vehicle" | "problem";
  vehicle: VehicleProfile;
  provenance: EvidenceProvenance;
  recognition: Recognition;
  problems: DiagnosticProblem[];
  decisions: DecisionRecord[];
  recommendations: Recommendation[];
  campaigns: string[];
  tsbs: string[];
  focusProblemId?: string;
  lastSession: DriveSessionSummary | null;
  cycles: LearningCycle[];
  solutionHistory: SolutionHistory | null;
}): string {
  const v = input.vehicle;
  const label = `${v.year ?? ""} ${v.make} ${v.model} ${v.trim ?? ""}`.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  lines.push(`# Diagnostic report — ${label}`);
  lines.push("");
  lines.push(`- **Vehicle id:** ${v.id}`);
  lines.push(`- **Engine family:** ${v.engineFamily}`);
  if (v.odometerMiles !== undefined) lines.push(`- **Odometer:** ${v.odometerMiles} mi`);
  lines.push(`- **Scope:** ${input.scope}`);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Evidence provenance");
  if (input.provenance.batchCount === 0) {
    lines.push("No observation batches on file.");
  } else {
    lines.push(
      `- **Latest source:** ${input.provenance.latestSource} @ ${input.provenance.latestCapturedAt}`,
    );
    lines.push(`- **Batches:** ${input.provenance.batchCount}`);
    lines.push(`- **Sources seen:** ${input.provenance.sourcesSeen.join(", ")}`);
  }
  lines.push("");

  appendLastSessionSection(lines, input.lastSession);
  appendLearningSection(lines, input.cycles, input.solutionHistory);

  lines.push("## Proven fault classes");
  if (input.recognition.mostSpecific.length === 0) {
    lines.push('Nothing proven from current evidence (not a claim of "healthy").');
  } else {
    for (const cls of input.recognition.mostSpecific) {
      const narr = input.recognition.narration?.find((n) => n.className === cls);
      lines.push(`- **${cls}**${narr ? ` — ${narr.fluent}` : ""}`);
    }
  }
  lines.push("");

  lines.push("## Diagnostic problems");
  if (input.problems.length === 0) {
    lines.push("None.");
  } else {
    for (const p of input.problems) {
      lines.push(`### ${p.triggeredByClass ?? p.id} (\`${p.status}\`)`);
      lines.push(`- Current: ${p.statement.currentState}`);
      lines.push(`- Desired: ${p.statement.desiredState}`);
      lines.push(`- Gap: ${p.statement.gap}`);
      if (p.solution) {
        lines.push(
          `- Solution kind: **${p.solution.kind}** — recommended \`${p.solution.recommended ?? "—"}\``,
        );
        lines.push(`- Rationale: ${p.solution.rationale}`);
        if (p.solution.ranked.length > 0) {
          lines.push("- Ranked actions:");
          for (const r of p.solution.ranked.slice(0, 5)) {
            lines.push(
              `  - \`${r.action.id}\` (score ${r.score.toFixed(2)}, conf ${r.action.confidence ?? "—"})`,
            );
          }
        }
      }
      if (p.outcome) {
        lines.push(`- Outcome: **${p.outcome.status}** (${p.outcome.recordedAt})`);
      }
      lines.push("");
    }
  }

  lines.push("## Recommendations");
  if (input.recommendations.length === 0) {
    lines.push("None open.");
  } else {
    for (const r of input.recommendations) {
      const bits: string[] = [r.priority];
      if (r.confidence !== undefined) bits.push(`conf ${(r.confidence * 100).toFixed(0)}%`);
      if (r.cost !== undefined) bits.push(`cost ${(r.cost * 100).toFixed(0)}%`);
      if (r.risk !== undefined) bits.push(`risk ${(r.risk * 100).toFixed(0)}%`);
      if (r.status !== "new") bits.push(r.status);
      lines.push(`- **${r.title}** (${bits.join(" · ")}) — ${r.reason}`);
      if (r.generatedFromClasses.length > 0) {
        lines.push(`  - Classes: ${r.generatedFromClasses.join(", ")}`);
      }
      if (r.generatedFromCampaignIds && r.generatedFromCampaignIds.length > 0) {
        lines.push(`  - Campaigns/TSBs: ${r.generatedFromCampaignIds.join(", ")}`);
      }
    }
  }
  lines.push("");

  lines.push("## Decisions / repairs");
  if (input.decisions.length === 0) {
    lines.push("None logged.");
  } else {
    for (const d of input.decisions) {
      const outcome = d.outcome ? ` → ${d.outcome.status}` : "";
      lines.push(
        `- \`${d.actionId}\`${outcome} — ${d.rationale} (${d.decidedAt}, by ${d.decidedBy})`,
      );
    }
  }
  lines.push("");

  if (input.campaigns.length > 0 || input.tsbs.length > 0) {
    lines.push("## Campaigns / TSBs");
    for (const c of input.campaigns) lines.push(`- Campaign: ${c}`);
    for (const t of input.tsbs) lines.push(`- TSB: ${t}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "_Compose-only report from auto-architect. Fault classes come from LOGOS realize; this document is not a new source of truth._",
  );
  return lines.join("\n");
}
