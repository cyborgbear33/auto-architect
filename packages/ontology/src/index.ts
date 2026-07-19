/**
 * Typed accessors over the ontology's JSON registries. Nothing here talks to
 * LOGOS directly (that's @auto/logos-bridge + apps/api/services/recognition) —
 * this package just owns and exposes the source-controlled meaning: the DL
 * TBox, which vehicle maps to which engine family, DTC descriptions, and
 * known manufacturer campaigns.
 */

import type { EngineFamily, KnownCampaign, VehicleProfile } from "@auto/semantic-types";
import type { ZodError } from "zod";
import dlOntologyJson from "../dl-ontology.json" with { type: "json" };
import dtcDictionaryJson from "../dtc-dictionary.json" with { type: "json" };
import knownCampaignsJson from "../known-campaigns.json" with { type: "json" };
import vehicleProfilesJson from "../vehicle-profiles.json" with { type: "json" };
import {
  type LintableOntology,
  lintOntology,
  type OntologyLintIssue,
  type OntologyLintResult,
} from "./lint.ts";
import {
  DtcDictionaryFileSchema,
  KnownCampaignsFileSchema,
  type VehicleProfilesFile,
  VehicleProfilesFileSchema,
} from "./schemas.ts";

export type {
  LintableDtcDictionary,
  LintableOntology,
  LintOntologyParams,
  OntologyLintIssue,
  OntologyLintResult,
} from "./lint.ts";
export {
  DtcDictionaryFileSchema,
  KnownCampaignsFileSchema,
  VehicleProfilesFileSchema,
} from "./schemas.ts";
export { lintOntology };

export const dlOntology: Record<string, unknown> = dlOntologyJson;

export interface DtcDictionaryEntry {
  description: string;
  concept: string;
  sae: boolean;
  engineFamily?: string;
  note?: string;
}

const dtcDictionaryFile = DtcDictionaryFileSchema.parse(dtcDictionaryJson);
const vehicleProfilesFile: VehicleProfilesFile =
  VehicleProfilesFileSchema.parse(vehicleProfilesJson);
const knownCampaignsFile = KnownCampaignsFileSchema.parse(knownCampaignsJson);

const dtcDictionary: Record<string, DtcDictionaryEntry> = dtcDictionaryFile.codes;

export function lookupDtc(code: string): DtcDictionaryEntry | undefined {
  return dtcDictionary[code.toUpperCase()];
}

export function allDtcCodes(): string[] {
  return Object.keys(dtcDictionary);
}

export function listVehicleProfiles(): VehicleProfile[] {
  return Object.entries(vehicleProfilesFile.vehicles).map(([id, v]) => ({ id, ...v }));
}

export function getVehicleProfile(id: string): VehicleProfile | undefined {
  const v = vehicleProfilesFile.vehicles[id];
  return v ? { id, ...v } : undefined;
}

export function getEngineFamily(id: string): EngineFamily | undefined {
  const f = vehicleProfilesFile.engineFamilies[id];
  return f ? { id, label: f.label, cartridges: f.cartridges } : undefined;
}

/** The named ontology `view` (TBox slice) an engine family's realize calls should use. */
export function getEngineFamilyView(engineFamilyId: string): string {
  return vehicleProfilesFile.engineFamilies[engineFamilyId]?.view ?? "generic";
}

/** Cartridge names (packages/cartridges) to load for a given engine family. */
export function getEngineFamilyCartridges(engineFamilyId: string): string[] {
  return vehicleProfilesFile.engineFamilies[engineFamilyId]?.cartridges ?? [];
}

export function listEngineFamilies(): EngineFamily[] {
  return Object.entries(vehicleProfilesFile.engineFamilies).map(([id, f]) => ({
    id,
    label: f.label,
    cartridges: f.cartridges,
  }));
}

const knownCampaigns: KnownCampaign[] = knownCampaignsFile.campaigns.map((c) => ({
  id: c.id,
  title: c.title,
  engineFamily: c.engineFamily,
  yearRange: c.yearRange,
  summary: c.summary,
  reference: c.reference,
}));

export function campaignsForEngineFamily(
  engineFamilyId: string,
  year?: number | null,
): KnownCampaign[] {
  return knownCampaigns.filter((c) => {
    if (c.engineFamily !== engineFamilyId) return false;
    if (year == null) return true;
    return year >= c.yearRange[0] && year <= c.yearRange[1];
  });
}

export function listKnownCampaigns(): KnownCampaign[] {
  return knownCampaigns;
}

export interface TsbEntry {
  id: string;
  title: string;
  engineFamily: string;
  summary: string;
  reference: string;
}

export function tsbsForEngineFamily(engineFamilyId: string): TsbEntry[] {
  return knownCampaignsFile.tsbs.filter((t) => t.engineFamily === engineFamilyId);
}

function zodIssues(prefix: string, err: ZodError): OntologyLintIssue[] {
  return err.issues.map((issue) => ({
    code: "registry_schema_invalid",
    message: `${prefix}: ${issue.path.join(".") || "<root>"} — ${issue.message}`,
  }));
}

/**
 * Runs auto-architect's own catalog ↔ DL contract lint against the real,
 * source-controlled registries. `cartridgeRequiredClasses` /
 * `registeredCartridgeNames` are optional because @auto/ontology cannot
 * depend on @auto/cartridges (wrong direction) — callers that have them
 * (tests in @auto/cartridges) pass them in explicitly.
 */
export function runOntologyLint(
  opts: { cartridgeRequiredClasses?: string[]; registeredCartridgeNames?: string[] } = {},
): OntologyLintResult {
  const schemaErrors: OntologyLintIssue[] = [];
  const dtcParsed = DtcDictionaryFileSchema.safeParse(dtcDictionaryJson);
  if (!dtcParsed.success) schemaErrors.push(...zodIssues("dtc-dictionary.json", dtcParsed.error));
  const profilesParsed = VehicleProfilesFileSchema.safeParse(vehicleProfilesJson);
  if (!profilesParsed.success) {
    schemaErrors.push(...zodIssues("vehicle-profiles.json", profilesParsed.error));
  }
  const campaignsParsed = KnownCampaignsFileSchema.safeParse(knownCampaignsJson);
  if (!campaignsParsed.success) {
    schemaErrors.push(...zodIssues("known-campaigns.json", campaignsParsed.error));
  }

  if (
    schemaErrors.length > 0 ||
    !dtcParsed.success ||
    !profilesParsed.success ||
    !campaignsParsed.success
  ) {
    return { ok: false, errors: schemaErrors, warnings: [] };
  }

  return lintOntology({
    ontology: dlOntologyJson as unknown as LintableOntology,
    dtcDictionary: dtcParsed.data,
    vehicleProfiles: profilesParsed.data,
    cartridgeRequiredClasses: opts.cartridgeRequiredClasses,
    registeredCartridgeNames: opts.registeredCartridgeNames,
  });
}
