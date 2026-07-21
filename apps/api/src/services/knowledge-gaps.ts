/**
 * Knowledge-gap detection + durable proposal queue.
 * Heuristics propose; humans dispose (accept/dismiss + export).
 * Never writes dl-ontology.json / cartridges.
 */
import { draftForClass } from "@auto/cartridges";
import { lookupDtc } from "@auto/ontology";
import type {
  KnowledgeGapExport,
  KnowledgeGapProposal,
  KnowledgeGapStatus,
} from "@auto/semantic-types";
import { notFound } from "../lib/errors.ts";
import { newId, nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { RecognitionService } from "./recognition.ts";
import type { VehicleService } from "./vehicle.ts";

const OPEN_STATUSES: ReadonlySet<KnowledgeGapStatus> = new Set(["new"]);

type DetectedDraft = Omit<KnowledgeGapProposal, "id" | "createdAt" | "updatedAt" | "status">;

function dedupeKey(kind: KnowledgeGapProposal["kind"], primary: string): string {
  return `${kind}:${primary}`;
}

export class KnowledgeGapService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
  ) {}

  async list(vehicleId: string, opts?: { openOnly?: boolean }): Promise<KnowledgeGapProposal[]> {
    await this.vehicles.getOrThrow(vehicleId);
    const all = await this.store.gapProposals.listByVehicle(vehicleId);
    const filtered = opts?.openOnly ? all.filter((p) => OPEN_STATUSES.has(p.status)) : all;
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<KnowledgeGapProposal> {
    const p = await this.store.gapProposals.get(id);
    if (!p) throw notFound("KnowledgeGapProposal", id);
    return p;
  }

  /**
   * Detect gaps from current evidence + recognition + problem history; upsert
   * new proposals. Does not revive dismissed/accepted rows for the same key.
   */
  async refresh(vehicleId: string): Promise<KnowledgeGapProposal[]> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const detected = await this.detect(vehicleId, vehicle.engineFamily);
    const now = nowIso();

    for (const draft of detected) {
      const existing = await this.store.gapProposals.getByDedupeKey(vehicleId, draft.dedupeKey);
      if (existing) {
        if (existing.status === "dismissed" || existing.status === "accepted") {
          continue;
        }
        await this.store.gapProposals.update(existing.id, {
          title: draft.title,
          rationale: draft.rationale,
          evidence: draft.evidence,
          proposedPatch: draft.proposedPatch,
          updatedAt: now,
        });
        continue;
      }
      await this.store.gapProposals.create({
        ...draft,
        id: newId("gap"),
        status: "new",
        createdAt: now,
        updatedAt: now,
      });
    }

    return this.list(vehicleId);
  }

  async exportBundle(vehicleId: string): Promise<KnowledgeGapExport> {
    await this.vehicles.getOrThrow(vehicleId);
    const all = await this.store.gapProposals.listByVehicle(vehicleId);
    const proposals = all
      .filter((p) => p.status === "accepted" || p.status === "new")
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
    const generatedAt = nowIso();
    const markdown = composeExportMarkdown(vehicleId, generatedAt, proposals);
    return { vehicleId, generatedAt, markdown, proposals };
  }

  private async detect(vehicleId: string, engineFamily: string): Promise<DetectedDraft[]> {
    const drafts: DetectedDraft[] = [];
    const dtcs = await this.store.observations.latestDtcs(vehicleId);
    const recognition = await this.recognition.recognize(vehicleId);
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const cartridges = this.vehicles.cartridgesFor(vehicle);
    const problems = await this.store.problems.listByVehicle(vehicleId);

    // unrecognized_dtc
    const unknownCodes = [
      ...new Set(dtcs.filter((d) => !lookupDtc(d.code)).map((d) => d.code.toUpperCase())),
    ];
    for (const code of unknownCodes) {
      drafts.push({
        vehicleId,
        kind: "unrecognized_dtc",
        title: `Unrecognized DTC ${code}`,
        rationale: `${code} was observed but is not in the curated DTC dictionary — perception skipped it for realize.`,
        evidence: { dtcCodes: [code] },
        dedupeKey: dedupeKey("unrecognized_dtc", code),
        proposedPatch: {
          kind: "dtc_dictionary",
          targetPath: "packages/ontology/dtc-dictionary.json",
          hint: JSON.stringify(
            {
              [code]: {
                description: `TODO: SAE/OEM description for ${code}`,
                concept: "TODO_SymptomOrCondition",
              },
            },
            null,
            2,
          ),
        },
      });
    }

    // undecided_class — LOGOS could not decide; only when we have some DTC evidence
    if (dtcs.length > 0) {
      for (const className of recognition.undecided ?? []) {
        drafts.push({
          vehicleId,
          kind: "undecided_class",
          title: `Undecided class ${className}`,
          rationale: `Realize left ${className} undecided while DTCs/PIDs are present — evidence may be incomplete for a proof.`,
          evidence: {
            classNames: [className],
            dtcCodes: dtcs.map((d) => d.code),
            note: "undecided with non-empty DTC list",
          },
          dedupeKey: dedupeKey("undecided_class", className),
          proposedPatch: {
            kind: "cartridge_note",
            targetPath: "packages/cartridges",
            hint: `Review perception thresholds / fixtures for ${className} on ${engineFamily}. Do not invent membership outside realize.`,
          },
        });
      }
    }

    // unframed_class — proven but no cartridge draft
    const vehicleView = {
      vehicleId,
      label: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ").trim(),
      engineFamily: vehicle.engineFamily,
      dtcs,
      pids: await this.store.observations.latestPids(vehicleId),
    };
    for (const className of recognition.mostSpecific) {
      if (draftForClass(vehicleView, className, cartridges)) continue;
      drafts.push({
        vehicleId,
        kind: "unframed_class",
        title: `Unframed proven class ${className}`,
        rationale: `${className} is proven by realize but no loaded cartridge frames a DiagnosticProblem draft.`,
        evidence: { classNames: [className] },
        dedupeKey: dedupeKey("unframed_class", className),
        proposedPatch: {
          kind: "cartridge_note",
          targetPath: "packages/cartridges/src",
          hint: `Add or extend a cartridge framing draftForClass for ${className} (${engineFamily}).`,
        },
      });
    }

    // verify_reopened — case has reopen lineage
    for (const p of problems) {
      if (!p.reopenedFromId) continue;
      drafts.push({
        vehicleId,
        kind: "verify_reopened",
        title: `Reopened after verify: ${p.triggeredByClass ?? p.id}`,
        rationale:
          "A case was reopened after repair/verify — the playbook or success criteria may need a knowledge review.",
        evidence: {
          problemId: p.id,
          ...(p.triggeredByClass ? { classNames: [p.triggeredByClass] } : {}),
          note: `reopenedFromId=${p.reopenedFromId}`,
        },
        dedupeKey: dedupeKey("verify_reopened", p.reopenedFromId),
        proposedPatch: {
          kind: "human_note",
          hint: `Review outcome priors and success criteria for ${p.triggeredByClass ?? "manual case"} (problem ${p.reopenedFromId} → ${p.id}).`,
        },
      });
    }

    return drafts;
  }
}

function composeExportMarkdown(
  vehicleId: string,
  generatedAt: string,
  proposals: KnowledgeGapProposal[],
): string {
  const lines: string[] = [
    `# Knowledge-gap export`,
    ``,
    `- Vehicle: \`${vehicleId}\``,
    `- Generated: ${generatedAt}`,
    `- Count: ${proposals.length}`,
    ``,
    `These are **propose-only** hints. Land changes via a curated ontology/cartridge PR — never auto-write the TBox.`,
    ``,
  ];
  if (proposals.length === 0) {
    lines.push(`_No open or accepted proposals._`);
    return lines.join("\n");
  }
  for (const p of proposals) {
    lines.push(`## ${p.title}`);
    lines.push(``);
    lines.push(`- Kind: \`${p.kind}\``);
    lines.push(`- Status: \`${p.status}\``);
    lines.push(`- Dedupe: \`${p.dedupeKey}\``);
    lines.push(`- Rationale: ${p.rationale}`);
    if (p.proposedPatch.targetPath) {
      lines.push(`- Target: \`${p.proposedPatch.targetPath}\``);
    }
    lines.push(``);
    lines.push("```");
    lines.push(p.proposedPatch.hint);
    lines.push("```");
    lines.push(``);
  }
  return lines.join("\n");
}
