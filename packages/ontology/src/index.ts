/**
 * Typed accessors over the ontology's JSON registries. Nothing here talks to
 * LOGOS directly (that's @auto/logos-bridge + apps/api/services/recognition) —
 * this package just owns and exposes the source-controlled meaning: the DL
 * TBox, which vehicle maps to which engine family, DTC descriptions, and
 * known manufacturer campaigns.
 */

import type { EngineFamily, KnownCampaign, VehicleProfile } from "@auto/semantic-types";
import dlOntologyJson from "../dl-ontology.json" with { type: "json" };
import dtcDictionaryJson from "../dtc-dictionary.json" with { type: "json" };
import knownCampaignsJson from "../known-campaigns.json" with { type: "json" };
import vehicleProfilesJson from "../vehicle-profiles.json" with { type: "json" };
import { type LintableOntology, lintOntology, type OntologyLintResult } from "./lint.ts";

export type {
  LintableDtcDictionary,
  LintableOntology,
  LintOntologyParams,
  OntologyLintIssue,
  OntologyLintResult,
} from "./lint.ts";
export { lintOntology };

export const dlOntology: Record<string, unknown> = dlOntologyJson;

export interface DtcDictionaryEntry {
  description: string;
  concept: string;
  sae: boolean;
  engineFamily?: string;
  note?: string;
}

const dtcDictionary: Record<string, DtcDictionaryEntry> = dtcDictionaryJson.codes as Record<
  string,
  DtcDictionaryEntry
>;

export function lookupDtc(code: string): DtcDictionaryEntry | undefined {
  return dtcDictionary[code.toUpperCase()];
}

export function allDtcCodes(): string[] {
  return Object.keys(dtcDictionary);
}

interface VehicleProfilesFile {
  vehicles: Record<
    string,
    {
      make: string;
      model: string;
      year: number | null;
      trim: string | null;
      engineFamily: string;
      obdProtocol?: string | null;
      notes?: string;
    }
  >;
  engineFamilies: Record<string, { label: string; view: string; cartridges: string[] }>;
}

const vehicleProfilesFile = vehicleProfilesJson as VehicleProfilesFile;

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

const knownCampaigns: KnownCampaign[] = [
  ...knownCampaignsJson.campaigns.map((c) => ({
    id: c.id,
    title: c.title,
    engineFamily: c.engineFamily,
    yearRange: c.yearRange as [number, number],
    summary: c.summary,
    reference: c.reference,
  })),
];

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
  return (knownCampaignsJson.tsbs as TsbEntry[]).filter((t) => t.engineFamily === engineFamilyId);
}

/**
 * Runs auto-architect's own catalog ↔ DL contract lint against the real,
 * source-controlled registries. `cartridgeRequiredClasses` is optional
 * because @auto/ontology cannot depend on @auto/cartridges (wrong
 * direction) — callers that have it (scripts/lint-ontology.mjs, or a test in
 * @auto/cartridges) pass it in explicitly.
 */
export function runOntologyLint(
  opts: { cartridgeRequiredClasses?: string[] } = {},
): OntologyLintResult {
  return lintOntology({
    ontology: dlOntologyJson as unknown as LintableOntology,
    dtcDictionary: dtcDictionaryJson as { codes: Record<string, { concept: string }> },
    cartridgeRequiredClasses: opts.cartridgeRequiredClasses,
  });
}
