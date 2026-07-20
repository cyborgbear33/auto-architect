/**
 * Vehicle & OBD-II mastery guide — personalized peace-of-mind curriculum.
 * Template: docs/VEHICLE_OBD_MASTERY_GUIDE.md
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listSpecialProcedures } from "@auto/ontology";
import type { MasteryGuide, MasteryGuideSection, VehicleProfile } from "@auto/semantic-types";
import type { DiscoveryService } from "./discovery.ts";
import { markdownToPrintHtml } from "./report.ts";
import type { VehicleService } from "./vehicle.ts";

const TEMPLATE_PATH = fileURLToPath(
  new URL("../../../../docs/VEHICLE_OBD_MASTERY_GUIDE.md", import.meta.url),
);

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function bulletBlock(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

function parseSections(markdown: string): MasteryGuideSection[] {
  const lines = markdown.split("\n");
  const sections: MasteryGuideSection[] = [];
  let current: MasteryGuideSection | null = null;
  const body: string[] = [];

  const flush = () => {
    if (!current) return;
    current.markdown = body.join("\n").trim();
    sections.push(current);
    body.length = 0;
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      const title = line.slice(3).trim();
      current = { id: slugify(title), title, markdown: "" };
      continue;
    }
    if (current) body.push(line);
  }
  flush();
  return sections;
}

export class MasteryGuideService {
  constructor(
    private vehicles: VehicleService,
    private discovery: DiscoveryService,
  ) {}

  async forVehicle(vehicleId: string): Promise<MasteryGuide> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const family = this.vehicles.engineFamilyOf(vehicle);
    const cartridges = this.vehicles.cartridgesFor(vehicle).map((c) => c.name);
    const procedures = listSpecialProcedures(vehicle.engineFamily);
    const forensics = await this.discovery.getForensics(vehicleId);
    const generatedAt = new Date().toISOString();
    const title = `Vehicle & OBD mastery — ${vehicle.year ?? "?"} ${vehicle.make} ${vehicle.model}`;

    const tokens: Record<string, string> = {
      "{{CLI_VEHICLE_ID}}": vehicle.id,
      "{{GENERATED_AT}}": generatedAt,
      "{{PERSONALIZED_FRONT}}": this.frontMatter(vehicle, family.label, title, generatedAt),
      "{{HARDWARE_BLOCK}}": this.hardwareBlock(vehicle, forensics?.hardware.adapterNotes ?? []),
      "{{ONTOLOGY_BLOCK}}": this.ontologyBlock(family.label, family.id, cartridges),
      "{{DISCOVERY_BLOCK}}": this.discoveryBlock(vehicle.id, forensics),
      "{{PROCEDURES_BLOCK}}": this.proceduresBlock(procedures.map((p) => p.title)),
      "{{TROUBLESHOOTING_BLOCK}}": this.troubleshootingBlock(vehicle),
    };

    let markdown = readFileSync(TEMPLATE_PATH, "utf8");
    // Drop the repo-only preamble tip that duplicates in-app chrome (keep curriculum).
    markdown = markdown.replace(
      /> \*\*In-app:\*\*[^\n]+\n> [^\n]+\n> [^\n]+\n\n---\n\n/,
      "",
    );
    for (const [token, value] of Object.entries(tokens)) {
      markdown = markdown.split(token).join(value);
    }

    // Retitle H1 for this vehicle.
    markdown = markdown.replace(/^# .+$/m, `# ${title}`);

    const sections = parseSections(markdown);
    return {
      vehicleId: vehicle.id,
      title,
      generatedAt,
      sections,
      markdown,
      html: markdownToPrintHtml(markdown, { title }),
    };
  }

  private frontMatter(
    vehicle: VehicleProfile,
    familyLabel: string,
    title: string,
    generatedAt: string,
  ): string {
    return [
      `## Your vehicle right now`,
      "",
      `This Guide is personalized for **${vehicle.year ?? "?"} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}**.`,
      "",
      bulletBlock([
        `**Profile id:** \`${vehicle.id}\``,
        `**Engine family:** ${familyLabel} (\`${vehicle.engineFamily}\`)`,
        `**Expected protocol:** ${vehicle.obdProtocol ?? "auto-detect (leave gateway protocol unset)"}`,
        `**Generated:** ${generatedAt}`,
      ]),
      "",
      `_Document title: ${title}_`,
    ].join("\n");
  }

  private hardwareBlock(vehicle: VehicleProfile, adapterNotes: string[]): string {
    const lines = [
      `Preferred adapter: **OBDLink MX+**.`,
      vehicle.notes?.trim()
        ? `Profile notes: ${vehicle.notes.trim()}`
        : "No extra profile notes on file.",
    ];
    if (adapterNotes.length > 0) {
      lines.push("Hardware context from Discovery / profile:");
      for (const n of adapterNotes) lines.push(`  - ${n}`);
    } else if (vehicle.make.toLowerCase() === "jeep") {
      lines.push(
        "Jeep: use the gray-type OBD-II adapter between DLC and MX+ for access (and Proxi when prompted).",
      );
    }
    return ["### Hardware for this profile", "", ...lines.map((l) => (l.startsWith("  -") ? l : `- ${l}`))].join(
      "\n",
    );
  }

  private ontologyBlock(familyLabel: string, familyId: string, cartridges: string[]): string {
    return [
      "### This vehicle’s ontology slice",
      "",
      bulletBlock([
        `Engine family label: **${familyLabel}**`,
        `Family id: \`${familyId}\``,
        `Cartridges loaded: ${cartridges.map((c) => `\`${c}\``).join(", ") || "(none)"}`,
      ]),
    ].join("\n");
  }

  private discoveryBlock(
    vehicleId: string,
    forensics: Awaited<ReturnType<DiscoveryService["getForensics"]>>,
  ): string {
    if (!forensics) {
      return [
        "### Discovery status for this vehicle",
        "",
        "**No discovery report on file yet.** Run gateway `discover` (live or `--simulate`), then open **Discovery**.",
        "",
        "```bash",
        `python -m obd_gateway --vehicle-id ${vehicleId} --simulate --dry-run discover`,
        `python -m obd_gateway --vehicle-id ${vehicleId} discover`,
        "```",
      ].join("\n");
    }
    const s = forensics.summary;
    return [
      "### Discovery status for this vehicle",
      "",
      `Latest capture: **${forensics.capturedAt}** · source \`${forensics.source}\``,
      "",
      bulletBlock([
        `Mode 01: ${s.mode01Supported} supported / ${s.mode01Unsupported} unsupported / ${s.mode01Unknown} unknown`,
        `Mode 06: ${s.mode06Supported} supported / ${s.mode06Unsupported} unsupported / ${s.mode06Unknown} unknown`,
        `Freeze frame: ${flag(s.freezeFrame)} · VIN: ${flag(s.vin)} · Mode 03: ${flag(s.mode03Dtcs)}`,
        `Unmapped supported PIDs: ${s.unmappedSupportedPids}`,
        `Cartridge-relevant PIDs available: ${s.cartridgeRelevantAvailable}`,
        "Open **Discovery** for filterable tables and the intelligence report download.",
      ]),
    ].join("\n");
  }

  private proceduresBlock(titles: string[]): string {
    if (titles.length === 0) {
      return [
        "### Special procedures for this family",
        "",
        "No curated Functions procedures for this engine family yet. Standard OBD path still applies.",
      ].join("\n");
    }
    return [
      "### Special procedures for this family",
      "",
      "Open **Functions** for guided checklists. Titles on file:",
      "",
      ...titles.map((t) => `- ${t}`),
    ].join("\n");
  }

  private troubleshootingBlock(vehicle: VehicleProfile): string {
    const jeep = vehicle.make.toLowerCase() === "jeep";
    const lines = [
      "### Profile-specific tips",
      "",
      `- Confirm UI selection is \`${vehicle.id}\` before every gateway command.`,
    ];
    if (jeep) {
      lines.push(
        "- Connection flaky: reseat gray adapter + MX+, ignition on, then retry auto-detect.",
        "- Stuck in Park / flashing odo after battery: **Functions → Proxi**, not another Mode 03-only scan.",
      );
    } else if (vehicle.engineFamily.startsWith("gm-")) {
      lines.push(
        "- Protocol errors: clear forced CAN; allow ELM auto-detect (GMT800 gas is often J1850 VPW).",
      );
    }
    return lines.join("\n");
  }
}

function flag(v: boolean | null): string {
  if (v === true) return "supported";
  if (v === false) return "unsupported";
  return "unknown";
}
