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
    return {
      scope: "vehicle",
      vehicleId,
      generatedAt: new Date().toISOString(),
      markdown,
    };
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
    return {
      scope: "problem",
      vehicleId: problem.vehicleId,
      problemId,
      generatedAt: new Date().toISOString(),
      markdown,
    };
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
