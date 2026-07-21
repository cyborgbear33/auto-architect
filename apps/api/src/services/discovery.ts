/**
 * OBD capability discovery — ingest gateway support probes and enrich with
 * ontology / cartridge / hardware context into a forensics report.
 */
import { resolveCartridgesForEngineFamily } from "@auto/cartridges";
import { allMode06Mids, allPidKeys, lookupMode06, lookupPid } from "@auto/ontology";
import type {
  DiscoveryForensicsReport,
  DiscoveryMode06Row,
  DiscoveryPidRow,
  DiscoverySupportStatus,
  ObdCapabilityReport,
  VehicleProfile,
} from "@auto/semantic-types";
import type { ObdCapabilityReportInput } from "@auto/validation";
import { notFound } from "../lib/errors.ts";
import type { Store } from "../store/index.ts";
import { DEFAULT_LIVE_GAUGE_PIDS } from "./observations.ts";
import { markdownToPrintHtml } from "./report.ts";
import type { VehicleService } from "./vehicle.ts";

const PREFERRED_ADAPTER = "OBDLink MX+";

function cartridgeRelevantPids(engineFamily: string): Set<string> {
  const cartridges = resolveCartridgesForEngineFamily(engineFamily);
  const keys = new Set<string>();
  for (const c of cartridges) {
    for (const pid of c.requires.pids ?? []) keys.add(pid);
    for (const rule of c.perception) {
      if (rule.pid) keys.add(rule.pid);
    }
  }
  return keys;
}

function hardwareNotes(vehicle: VehicleProfile): string[] {
  const notes: string[] = [
    `${PREFERRED_ADAPTER} is the preferred Bluetooth ELM327-class interface for standard OBD-II discovery.`,
  ];
  const profileNotes = vehicle.notes ?? "";
  const mentionsGray = /gray[- ]?type|gray adapter/i.test(profileNotes);
  const isJeep = vehicle.make.toLowerCase() === "jeep";
  if (mentionsGray || isJeep) {
    notes.push(
      "Jeep Renegade: use a gray-type OBD-II adapter/extension between the vehicle DLC and the MX+ for physical access (and for AlfaOBD Proxi when prompted). This is hardware context only — it does not unlock OEM/UDS modules via the standard gateway.",
    );
  }
  if (vehicle.obdProtocol) {
    notes.push(`Profile expected protocol: ${vehicle.obdProtocol}.`);
  }
  return notes;
}

function supportStatus(
  pid: string,
  modes: ObdCapabilityReport["modes"]["mode01"],
  manualOnly: Set<string>,
): DiscoverySupportStatus {
  if (manualOnly.has(pid)) return "manual_only";
  if (modes.supported.includes(pid)) return "supported";
  if (modes.unsupported.includes(pid)) return "unsupported";
  return "unknown";
}

function midSupportStatus(
  mid: string,
  modes: ObdCapabilityReport["modes"]["mode06"],
): DiscoverySupportStatus {
  if (modes.supportedMids.includes(mid)) return "supported";
  if (modes.unsupportedMids.includes(mid)) return "unsupported";
  return "unknown";
}

function buildNarrative(
  vehicle: VehicleProfile,
  report: ObdCapabilityReport,
  forensics: Pick<DiscoveryForensicsReport, "summary" | "unmappedSupportedPids" | "hardware">,
): string[] {
  const lines: string[] = [];
  const { summary } = forensics;
  lines.push(
    `Discovery for ${vehicle.year ?? "?"} ${vehicle.make} ${vehicle.model} probes what Mode 01 PIDs, Mode 06 MIDs, freeze frame, DTCs, and VIN the ECU + ${PREFERRED_ADAPTER} expose — support bits, not a full value dump.`,
  );
  if (report.source === "simulated") {
    lines.push(
      "This report was simulated (catalog of what the gateway knows how to ask). Run a live `discover` with ignition on for ECU-backed support flags.",
    );
  } else if (!report.connection.connected) {
    lines.push("Gateway reported not connected — treat Mode 01/06 partitions cautiously.");
  } else if (report.connection.protocolName) {
    lines.push(`Connected via ${report.connection.protocolName}.`);
  }

  lines.push(
    `Mode 01: ${summary.mode01Supported} supported, ${summary.mode01Unsupported} unsupported, ${summary.mode01Unknown} unknown among probed keys.`,
  );
  lines.push(
    `Mode 06: ${summary.mode06Supported} supported MIDs, ${summary.mode06Unsupported} unsupported, ${summary.mode06Unknown} unknown.`,
  );
  lines.push(
    `${summary.cartridgeRelevantAvailable} cartridge-relevant PIDs are available for perception on this engine family.`,
  );

  if (summary.unmappedSupportedPids > 0) {
    lines.push(
      `${summary.unmappedSupportedPids} ECU-supported PID key(s) are missing from the ontology dictionary (${forensics.unmappedSupportedPids.join(", ")}).`,
    );
  }

  lines.push(
    "Standard discovery does not enumerate OEM modules or run Proxi/Functions — use Functions + AlfaOBD for those. Values still come from `scan` / `watch`.",
  );
  return lines;
}

function composeMarkdown(report: DiscoveryForensicsReport): string {
  const v = report.vehicle;
  const lines: string[] = [
    `# Vehicle intelligence — ${v.year ?? "?"} ${v.make} ${v.model}`,
    "",
    `Captured: ${report.capturedAt} · Source: ${report.source}`,
    "",
    "## Hardware & connection",
    "",
    `- Preferred adapter: ${report.hardware.preferredAdapter}`,
    `- Connected: ${report.hardware.connection.connected}`,
    `- Port: ${report.hardware.connection.port ?? "—"}`,
    `- Protocol: ${report.hardware.connection.protocolName ?? report.vehicle.profileObdProtocol ?? "—"}`,
    "",
    ...report.hardware.adapterNotes.map((n) => `- ${n}`),
    "",
    "## Coverage summary",
    "",
    `- Mode 01: ${report.summary.mode01Supported} supported / ${report.summary.mode01Unsupported} unsupported / ${report.summary.mode01Unknown} unknown`,
    `- Mode 06: ${report.summary.mode06Supported} supported / ${report.summary.mode06Unsupported} unsupported / ${report.summary.mode06Unknown} unknown`,
    `- Freeze frame: ${flagLabel(report.summary.freezeFrame)}`,
    `- Mode 03 DTCs: ${flagLabel(report.summary.mode03Dtcs)}`,
    `- Mode 07 pending: ${flagLabel(report.summary.mode07Pending)}`,
    `- VIN: ${flagLabel(report.summary.vin)}`,
    `- Unmapped supported PIDs: ${report.summary.unmappedSupportedPids}`,
    `- Cartridge-relevant available: ${report.summary.cartridgeRelevantAvailable}`,
    "",
    "## What this means",
    "",
    ...report.narrative.map((n) => `- ${n}`),
    "",
    "## Mode 01",
    "",
    "| PID | Support | Unit | Ontology | Default poll | Cartridge |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of report.mode01) {
    lines.push(
      `| ${row.pid} | ${row.support} | ${row.unit ?? "—"} | ${row.inOntology ? "yes" : "no"} | ${row.inDefaultPoll ? "yes" : "—"} | ${row.cartridgeRelevant ? "yes" : "—"} |`,
    );
  }
  lines.push(
    "",
    "## Mode 06",
    "",
    "| MID | Support | Concept | Ontology |",
    "| --- | --- | --- | --- |",
  );
  for (const row of report.mode06) {
    lines.push(
      `| ${row.mid} | ${row.support} | ${row.concept ?? "—"} | ${row.inOntology ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function flagLabel(flag: boolean | null): string {
  if (flag === true) return "supported";
  if (flag === false) return "unsupported";
  return "unknown";
}

export class DiscoveryService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
  ) {}

  async record(input: ObdCapabilityReportInput): Promise<ObdCapabilityReport> {
    await this.vehicles.getOrThrow(input.vehicleId);
    const report = input as ObdCapabilityReport;
    await this.store.discovery.record(report);
    return report;
  }

  async getForensics(vehicleId: string): Promise<DiscoveryForensicsReport | null> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const raw = await this.store.discovery.latest(vehicleId);
    if (!raw) return null;
    return this.enrich(vehicle, raw);
  }

  async getReport(vehicleId: string): Promise<{
    markdown: string;
    html: string;
    capturedAt: string;
  } | null> {
    const forensics = await this.getForensics(vehicleId);
    if (!forensics) return null;
    return {
      markdown: forensics.markdown,
      html: forensics.html,
      capturedAt: forensics.capturedAt,
    };
  }

  private enrich(vehicle: VehicleProfile, raw: ObdCapabilityReport): DiscoveryForensicsReport {
    if (raw.vehicleId !== vehicle.id) {
      throw notFound("DiscoveryReport", raw.vehicleId);
    }

    const defaultPoll = new Set<string>(DEFAULT_LIVE_GAUGE_PIDS);
    const cartridgePids = cartridgeRelevantPids(vehicle.engineFamily);
    const manualOnly = new Set(raw.manualOnlyPids);
    const probedPids = new Set([
      ...raw.modes.mode01.supported,
      ...raw.modes.mode01.unsupported,
      ...raw.modes.mode01.unknown,
      ...raw.manualOnlyPids,
    ]);
    // Include ontology catalog keys so gaps (catalog-only) appear even if gateway omitted them.
    for (const key of allPidKeys()) probedPids.add(key);

    const mode01: DiscoveryPidRow[] = [...probedPids]
      .sort((a, b) => a.localeCompare(b))
      .map((pid) => {
        const entry = lookupPid(pid);
        return {
          pid,
          support: supportStatus(pid, raw.modes.mode01, manualOnly),
          description: entry?.description ?? null,
          unit: entry?.unit ?? null,
          pidHex: entry?.pidHex ?? null,
          inOntology: Boolean(entry),
          inDefaultPoll: defaultPoll.has(pid),
          cartridgeRelevant: cartridgePids.has(pid),
        };
      });

    const probedMids = new Set([
      ...raw.modes.mode06.supportedMids,
      ...raw.modes.mode06.unsupportedMids,
      ...raw.modes.mode06.unknownMids,
      ...allMode06Mids(),
    ]);

    const mode06: DiscoveryMode06Row[] = [...probedMids]
      .sort((a, b) => a.localeCompare(b))
      .map((mid) => {
        const entry = lookupMode06(mid);
        return {
          mid,
          support: midSupportStatus(mid, raw.modes.mode06),
          description: entry?.description ?? null,
          concept: entry?.concept ?? null,
          inOntology: Boolean(entry),
        };
      });

    const unmappedSupportedPids = raw.modes.mode01.supported.filter((pid) => !lookupPid(pid));
    const cartridgeRelevantAvailable = mode01.filter(
      (r) => r.cartridgeRelevant && r.support === "supported",
    ).length;

    const summary: DiscoveryForensicsReport["summary"] = {
      mode01Supported: raw.modes.mode01.supported.length,
      mode01Unsupported: raw.modes.mode01.unsupported.length,
      mode01Unknown: raw.modes.mode01.unknown.length,
      mode06Supported: raw.modes.mode06.supportedMids.length,
      mode06Unsupported: raw.modes.mode06.unsupportedMids.length,
      mode06Unknown: raw.modes.mode06.unknownMids.length,
      freezeFrame: raw.modes.mode02FreezeFrame.supported,
      mode03Dtcs: raw.modes.mode03Dtcs.supported,
      mode07Pending: raw.modes.mode07Pending.supported,
      vin: raw.modes.vin.supported,
      unmappedSupportedPids: unmappedSupportedPids.length,
      cartridgeRelevantAvailable,
    };

    const hardware = {
      preferredAdapter: PREFERRED_ADAPTER,
      adapterNotes: hardwareNotes(vehicle),
      connection: raw.connection,
    };

    const partial = { summary, unmappedSupportedPids, hardware };
    const narrative = buildNarrative(vehicle, raw, partial);

    const forensics: DiscoveryForensicsReport = {
      vehicleId: vehicle.id,
      capturedAt: raw.capturedAt,
      source: raw.source,
      vehicle: {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim ?? null,
        engineFamily: vehicle.engineFamily,
        profileObdProtocol: vehicle.obdProtocol ?? null,
      },
      hardware,
      summary,
      mode01,
      mode06,
      unmappedSupportedPids,
      narrative,
      markdown: "",
      html: "",
    };
    forensics.markdown = composeMarkdown(forensics);
    forensics.html = markdownToPrintHtml(forensics.markdown);
    return forensics;
  }
}
