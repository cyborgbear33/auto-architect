import type { ObservationBatchInput } from "@auto/validation";
import { validationError } from "../lib/errors.ts";

export type ObdLogImportFormat = "obdlog-v1" | "json-batches" | "elm327-text" | "auto";

export interface ObdLogImportResult {
  format: Exclude<ObdLogImportFormat, "auto">;
  batchesRecorded: number;
  linesParsed: number;
  linesSkipped: number;
}

type Acc = {
  capturedAt: string;
  dtcs: NonNullable<ObservationBatchInput["dtcs"]>;
  pids: NonNullable<ObservationBatchInput["pids"]>;
};

const HEADER_RE = /^#\s*auto-architect\.obdlog\s+v1\s*$/i;
const META_VEHICLE_RE = /^vehicle:\s*(\S+)\s*$/i;
const META_SOURCE_RE = /^source:\s*(obd_gateway|simulated|manual_entry)\s*$/i;
const DTC_RE =
  /^(\d{4}-\d{2}-\d{2}T[\d:.Z+-]+)\s+DTC\s+(P[0-9A-Fa-f]{4})\s+(stored|pending|permanent)\s*$/i;
const PID_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.Z+-]+)\s+PID\s+([A-Z0-9_]+)\s+(-?\d+(?:\.\d+)?)\s*$/i;

/** Common Mode 01 PID hex → dictionary key + decode (A,B bytes). */
const MODE01_DECODE: Record<string, { pid: string; decode: (a: number, b: number) => number }> = {
  "04": { pid: "ENGINE_LOAD", decode: (a) => (a * 100) / 255 },
  "05": { pid: "COOLANT_TEMP", decode: (a) => a - 40 },
  "06": { pid: "SHORT_FUEL_TRIM_1", decode: (a) => ((a - 128) * 100) / 128 },
  "07": { pid: "SHORT_FUEL_TRIM_2", decode: (a) => ((a - 128) * 100) / 128 },
  "08": { pid: "LONG_FUEL_TRIM_1", decode: (a) => ((a - 128) * 100) / 128 },
  "09": { pid: "LONG_FUEL_TRIM_2", decode: (a) => ((a - 128) * 100) / 128 },
  "0B": { pid: "INTAKE_PRESSURE", decode: (a) => a },
  "0C": { pid: "RPM", decode: (a, b) => (a * 256 + b) / 4 },
  "0D": { pid: "SPEED", decode: (a) => a },
  "0E": { pid: "TIMING_ADVANCE", decode: (a) => a / 2 - 64 },
  "0F": { pid: "INTAKE_TEMP", decode: (a) => a - 40 },
  "11": { pid: "THROTTLE_POS", decode: (a) => (a * 100) / 255 },
};

/**
 * Detect import format from content when the caller passes `auto` or omits format.
 */
export function detectObdLogFormat(text: string): Exclude<ObdLogImportFormat, "auto"> {
  const trimmed = text.trim();
  if (!trimmed) throw validationError("Import text is empty.");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json-batches";
  if (HEADER_RE.test(trimmed.split(/\r?\n/, 1)[0] ?? "")) return "obdlog-v1";
  if (looksLikeElm327(trimmed)) return "elm327-text";
  // Fallback: treat as our line format (will fail with a clear header error).
  return "obdlog-v1";
}

function looksLikeElm327(text: string): boolean {
  const sample = text.slice(0, 4000);
  const atCmd = new RegExp("^>?\\s*AT[A-Z0-9]+\\s*$", "im");
  const modeReq = new RegExp("^>?\\s*0[0-9A-Fa-f]{2}\\s*$", "m");
  return (
    /\bELM327\b/i.test(sample) ||
    atCmd.test(sample) ||
    modeReq.test(sample) ||
    /\b41\s+[0-9A-Fa-f]{2}\b/.test(sample) ||
    /\b43\s+[0-9A-Fa-f]{2}\b/.test(sample)
  );
}

/**
 * Parse a software-only observation log into validated batch inputs.
 * Groups same-timestamp DTC/PID lines into one batch (offline garage path).
 */
export function parseObdLogV1(
  text: string,
  defaults: { vehicleId: string; source?: ObservationBatchInput["source"] },
): { batches: ObservationBatchInput[]; linesParsed: number; linesSkipped: number } {
  const lines = text.split(/\r?\n/);
  let vehicleId = defaults.vehicleId;
  let source: ObservationBatchInput["source"] = defaults.source ?? "manual_entry";
  let sawHeader = false;
  let linesParsed = 0;
  let linesSkipped = 0;
  const byTs = new Map<string, Acc>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) {
      linesSkipped += 1;
      continue;
    }
    if (HEADER_RE.test(line)) {
      sawHeader = true;
      linesParsed += 1;
      continue;
    }
    const vehicleMatch = line.match(META_VEHICLE_RE);
    if (vehicleMatch) {
      vehicleId = vehicleMatch[1]!;
      linesParsed += 1;
      continue;
    }
    const sourceMatch = line.match(META_SOURCE_RE);
    if (sourceMatch) {
      source = sourceMatch[1] as ObservationBatchInput["source"];
      linesParsed += 1;
      continue;
    }
    const dtcMatch = line.match(DTC_RE);
    if (dtcMatch) {
      const capturedAt = dtcMatch[1]!;
      const acc = getAcc(byTs, capturedAt);
      acc.dtcs.push({
        code: dtcMatch[2]!.toUpperCase(),
        status: dtcMatch[3]!.toLowerCase() as "stored" | "pending" | "permanent",
      });
      linesParsed += 1;
      continue;
    }
    const pidMatch = line.match(PID_RE);
    if (pidMatch) {
      const capturedAt = pidMatch[1]!;
      const acc = getAcc(byTs, capturedAt);
      acc.pids.push({
        pid: pidMatch[2]!.toUpperCase(),
        value: Number(pidMatch[3]),
        timestamp: capturedAt,
      });
      linesParsed += 1;
      continue;
    }
    linesSkipped += 1;
  }

  if (!sawHeader) {
    throw validationError(
      'OBD log must start with "# auto-architect.obdlog v1" (got unrecognized log text).',
    );
  }
  if (byTs.size === 0) {
    throw validationError("OBD log contained no DTC/PID rows.");
  }

  return {
    batches: finalizeBatches(byTs, vehicleId, source),
    linesParsed,
    linesSkipped,
  };
}

/**
 * Parse a raw ELM327 AT/request/response session dump into observation batches.
 * Supports Mode 01 (`41 XX …`) and Mode 03 (`43 …`) responses. Timestamps are
 * synthetic (session start + line index) unless ISO prefixes are present.
 */
export function parseElm327Text(
  text: string,
  defaults: { vehicleId: string; source?: ObservationBatchInput["source"] },
): { batches: ObservationBatchInput[]; linesParsed: number; linesSkipped: number } {
  const vehicleId = defaults.vehicleId;
  const source: ObservationBatchInput["source"] = defaults.source ?? "manual_entry";
  const lines = text.split(/\r?\n/);
  const byTs = new Map<string, Acc>();
  let linesParsed = 0;
  let linesSkipped = 0;
  const baseMs = Date.parse("2026-01-01T00:00:00.000Z");
  let lineIndex = 0;
  let pendingMode01: string | null = null;
  let pendingMode03 = false;

  for (const raw of lines) {
    lineIndex += 1;
    const stripped = raw.replace(/^\[[^\]]+\]\s*/, "").trim();
    if (!stripped) {
      linesSkipped += 1;
      continue;
    }
    // Prompt / echo
    if (stripped === ">" || stripped.startsWith(">")) {
      const cmd = stripped.replace(/^>\s*/, "").trim();
      if (!cmd) {
        linesSkipped += 1;
        continue;
      }
      // Fall through to treat command without leading >
      const handled = handleElmCommand(cmd, {
        pendingMode01: (v) => {
          pendingMode01 = v;
        },
        pendingMode03: (v) => {
          pendingMode03 = v;
        },
      });
      if (handled) linesParsed += 1;
      else linesSkipped += 1;
      continue;
    }

    const upper = stripped.toUpperCase();
    if (
      upper.startsWith("AT") ||
      upper === "OK" ||
      upper === "SEARCHING..." ||
      upper === "NODATA" ||
      upper === "NO DATA" ||
      upper === "?" ||
      /\bELM327\b/.test(upper)
    ) {
      linesSkipped += 1;
      continue;
    }

    // Command without prompt (request log)
    if (
      /^[0-9A-F]{2,}$/i.test(stripped.replace(/\s+/g, "")) &&
      !upper.startsWith("41") &&
      !upper.startsWith("43")
    ) {
      const compact = stripped.replace(/\s+/g, "").toUpperCase();
      if (compact.startsWith("01") && compact.length >= 4) {
        pendingMode01 = compact.slice(2, 4);
        pendingMode03 = false;
        linesParsed += 1;
        continue;
      }
      if (compact === "03" || compact.startsWith("03")) {
        pendingMode03 = true;
        pendingMode01 = null;
        linesParsed += 1;
        continue;
      }
    }

    const bytes = parseHexBytes(stripped);
    if (!bytes) {
      linesSkipped += 1;
      continue;
    }

    const capturedAt = new Date(baseMs + lineIndex * 1000).toISOString();
    if (bytes[0] === 0x41 && bytes.length >= 3) {
      const pidHex = bytes[1]!.toString(16).toUpperCase().padStart(2, "0");
      const decoded = decodeMode01(pidHex, bytes.slice(2));
      if (decoded) {
        const acc = getAcc(byTs, capturedAt);
        acc.pids.push({ pid: decoded.pid, value: decoded.value, timestamp: capturedAt });
        linesParsed += 1;
        pendingMode01 = null;
        continue;
      }
    }
    if (bytes[0] === 0x43 && bytes.length >= 3) {
      const codes = decodeMode03(bytes.slice(1));
      if (codes.length > 0) {
        const acc = getAcc(byTs, capturedAt);
        for (const code of codes) {
          acc.dtcs.push({ code, status: "stored" });
        }
        linesParsed += 1;
        pendingMode03 = false;
        continue;
      }
    }

    // Response without service byte (some dumps omit it after a pending request)
    if (pendingMode01 && bytes.length >= 1) {
      const decoded = decodeMode01(pendingMode01, bytes);
      if (decoded) {
        const acc = getAcc(byTs, capturedAt);
        acc.pids.push({ pid: decoded.pid, value: decoded.value, timestamp: capturedAt });
        linesParsed += 1;
        pendingMode01 = null;
        continue;
      }
    }
    if (pendingMode03 && bytes.length >= 2) {
      const codes = decodeMode03(bytes);
      if (codes.length > 0) {
        const acc = getAcc(byTs, capturedAt);
        for (const code of codes) {
          acc.dtcs.push({ code, status: "stored" });
        }
        linesParsed += 1;
        pendingMode03 = false;
        continue;
      }
    }

    linesSkipped += 1;
  }

  if (byTs.size === 0) {
    throw validationError(
      "ELM327 log contained no decodable Mode 01/03 responses (need lines like `41 0C …` or `43 …`).",
    );
  }

  return {
    batches: finalizeBatches(byTs, vehicleId, source),
    linesParsed,
    linesSkipped,
  };
}

function handleElmCommand(
  cmd: string,
  setters: { pendingMode01: (v: string | null) => void; pendingMode03: (v: boolean) => void },
): boolean {
  const compact = cmd.replace(/\s+/g, "").toUpperCase();
  if (compact.startsWith("AT")) return true;
  if (compact.startsWith("01") && compact.length >= 4) {
    setters.pendingMode01(compact.slice(2, 4));
    setters.pendingMode03(false);
    return true;
  }
  if (compact === "03" || compact.startsWith("03")) {
    setters.pendingMode03(true);
    setters.pendingMode01(null);
    return true;
  }
  return false;
}

function parseHexBytes(line: string): number[] | null {
  const parts = line
    .replace(/[^0-9A-Fa-f\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every((p) => /^[0-9A-Fa-f]{2}$/.test(p))) return null;
  return parts.map((p) => Number.parseInt(p, 16));
}

function decodeMode01(pidHex: string, data: number[]): { pid: string; value: number } | null {
  const key = pidHex.toUpperCase().padStart(2, "0");
  const spec = MODE01_DECODE[key];
  if (!spec || data.length === 0) return null;
  const a = data[0] ?? 0;
  const b = data[1] ?? 0;
  const value = Number(spec.decode(a, b).toFixed(2));
  return { pid: spec.pid, value };
}

/** Decode Mode 03 payload bytes into SAE P0xxx codes (stops at 00 00). */
function decodeMode03(data: number[]): string[] {
  const codes: string[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const hi = data[i]!;
    const lo = data[i + 1]!;
    if (hi === 0 && lo === 0) break;
    const system = (hi >> 6) & 0x03;
    const letter = ["P", "C", "B", "U"][system] ?? "P";
    const d1 = (hi >> 4) & 0x03;
    const d2 = hi & 0x0f;
    const d3 = (lo >> 4) & 0x0f;
    const d4 = lo & 0x0f;
    const code = `${letter}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`;
    // Prefer SAE powertrain P0xxx in this garage app; still accept Pxxxx.
    if (/^P[0-9A-F]{4}$/i.test(code)) codes.push(code.toUpperCase());
  }
  return codes;
}

function finalizeBatches(
  byTs: Map<string, Acc>,
  vehicleId: string,
  source: ObservationBatchInput["source"],
): ObservationBatchInput[] {
  return [...byTs.values()]
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((acc) => ({
      vehicleId,
      capturedAt: acc.capturedAt,
      source,
      ...(acc.dtcs.length > 0 ? { dtcs: acc.dtcs } : {}),
      ...(acc.pids.length > 0 ? { pids: acc.pids } : {}),
    }));
}

function getAcc(map: Map<string, Acc>, ts: string): Acc {
  let acc = map.get(ts);
  if (!acc) {
    acc = { capturedAt: ts, dtcs: [], pids: [] };
    map.set(ts, acc);
  }
  return acc;
}
