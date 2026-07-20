/**
 * Compose-only diagnostic shop note. Never mutates store state and never
 * invents fault classes — only aggregates existing read models.
 */
import type {
  DecisionRecord,
  DiagnosticProblem,
  EvidenceProvenance,
  Recognition,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import type { ActionService } from "./actions.ts";
import type { CampaignService } from "./campaigns.ts";
import type { ObservationService } from "./observations.ts";
import type { RecognitionService } from "./recognition.ts";
import type { RecommendationService } from "./recommendations.ts";
import type { VehicleService } from "./vehicle.ts";

export interface DiagnosticReport {
  scope: "vehicle" | "problem";
  vehicleId: string;
  problemId?: string;
  generatedAt: string;
  markdown: string;
  /** Print-friendly HTML (same content as markdown) with embedded stylesheet. */
  html: string;
}

export class ReportService {
  constructor(
    private vehicles: VehicleService,
    private observations: ObservationService,
    private recognition: RecognitionService,
    private recommendations: RecommendationService,
    private actions: ActionService,
    private campaigns: CampaignService,
  ) {}

  async forVehicle(vehicleId: string): Promise<DiagnosticReport> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const [provenance, recognition, problems, decisions, recommendations, campaignPack] =
      await Promise.all([
        this.observations.provenance(vehicleId),
        this.recognition.recognize(vehicleId),
        this.actions.listDiagnosticProblems(vehicleId),
        this.actions.listDecisions(vehicleId),
        this.recommendations.list(vehicleId),
        this.campaigns.forVehicle(vehicleId),
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
    });
    return wrapReport("vehicle", vehicleId, undefined, markdown);
  }

  async forProblem(problemId: string): Promise<DiagnosticReport> {
    const problem = await this.actions.getDiagnosticProblem(problemId);
    const vehicle = await this.vehicles.getOrThrow(problem.vehicleId);
    const [provenance, recognition, decisions, recommendations] = await Promise.all([
      this.observations.provenance(problem.vehicleId),
      this.recognition.recognize(problem.vehicleId),
      this.actions.listDecisions(problem.vehicleId),
      this.recommendations.list(problem.vehicleId),
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
    });
    return wrapReport("problem", problem.vehicleId, problemId, markdown);
  }
}

function wrapReport(
  scope: "vehicle" | "problem",
  vehicleId: string,
  problemId: string | undefined,
  markdown: string,
): DiagnosticReport {
  return {
    scope,
    vehicleId,
    problemId,
    generatedAt: new Date().toISOString(),
    markdown,
    html: markdownToPrintHtml(markdown),
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

/** Minimal Markdown → print HTML for our compose-only shop notes. */
export function markdownToPrintHtml(markdown: string): string {
  const blocks: string[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw;
    if (line.startsWith("# ")) {
      blocks.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      blocks.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      blocks.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line === "---") {
      blocks.push("<hr />");
    } else if (line.startsWith("- ")) {
      blocks.push(`<li>${inlineFormat(line.slice(2))}</li>`);
    } else if (line.startsWith("  - ")) {
      blocks.push(`<li class="nested">${inlineFormat(line.slice(4))}</li>`);
    } else if (line.trim() === "") {
      blocks.push("");
    } else if (line.startsWith("_") && line.endsWith("_")) {
      blocks.push(`<p class="footnote"><em>${inlineFormat(line.slice(1, -1))}</em></p>`);
    } else {
      blocks.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  // Wrap consecutive <li> into <ul>
  const htmlBody: string[] = [];
  let inList = false;
  for (const b of blocks) {
    if (b.startsWith("<li")) {
      if (!inList) {
        htmlBody.push("<ul>");
        inList = true;
      }
      htmlBody.push(b);
    } else {
      if (inList) {
        htmlBody.push("</ul>");
        inList = false;
      }
      htmlBody.push(b);
    }
  }
  if (inList) htmlBody.push("</ul>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Diagnostic report</title>
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
  @media print {
    body { margin: 0; max-width: none; padding: 0.4in 0.6in; }
    .no-print { display: none !important; }
    h2 { break-after: avoid; }
    ul, p { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
  @page { margin: 0.6in; }
</style>
</head>
<body>
<p class="no-print">Print this page (Ctrl/Cmd+P) for a shop-ready note. Close the tab when done.</p>
<article class="report">
${htmlBody.join("\n")}
</article>
</body>
</html>`;
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
      const conf = r.confidence !== undefined ? ` · conf ${(r.confidence * 100).toFixed(0)}%` : "";
      lines.push(`- **${r.title}** (${r.priority}${conf}) — ${r.reason}`);
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
