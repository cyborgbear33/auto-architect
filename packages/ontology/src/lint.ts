/**
 * auto-architect's own catalog ↔ DL contract lint. Pure, Python-free, and
 * runs on every `pnpm test` — a companion to (not a replacement for) the
 * real LOGOS well-formedness check (`logos ontology --json`, wired into
 * `scripts/lint-ontology.mjs`).
 *
 * LOGOS's engine-side `ontology-lint` command is deliberately Plant/family
 * shaped (garden-architect's taxon registry) and doesn't fit this domain's
 * fault-class/DTC catalog — so this is a small, honest, vehicle-domain
 * version of the same idea: every DTC dictionary entry must resolve to a
 * declared class, every view must reference real classes, cartridges must
 * never require a class the ontology doesn't declare, and vehicle profiles
 * must resolve engineFamily → view → known cartridge names.
 */

import type { VehicleProfilesFile } from "./schemas.ts";

export interface OntologyLintIssue {
  code: string;
  message: string;
}

export interface OntologyLintResult {
  ok: boolean;
  errors: OntologyLintIssue[];
  warnings: OntologyLintIssue[];
}

export interface LintableOntology {
  subtypes: Record<string, string>;
  classes: Record<string, unknown>;
  views: Record<string, { classes: string[] }>;
}

export interface LintableDtcDictionary {
  codes: Record<string, { concept: string }>;
}

export interface LintableMode06Dictionary {
  monitors: Record<string, { concept?: string; description: string }>;
}

export interface LintOntologyParams {
  ontology: LintableOntology;
  dtcDictionary: LintableDtcDictionary;
  /** Optional Mode 06 OBDMID dictionary — concepts must resolve to Condition subtypes. */
  mode06Dictionary?: LintableMode06Dictionary;
  /** Declared `Symptom` subtypes that are intentionally NOT DTC-driven (e.g. a
   *  future symptom inferred purely from PID trend, never a stored code). */
  allowNonDtcSymptoms?: string[];
  /** Union of every registered cartridge's `requires.classes` — checked so a
   *  cartridge can never silently reference a class the ontology dropped. */
  cartridgeRequiredClasses?: string[];
  /** Parsed vehicle-profiles.json — when present, engineFamily/view/cartridge
   *  wiring is checked. */
  vehicleProfiles?: VehicleProfilesFile;
  /** Names of every cartridge in `packages/cartridges` registry — when present
   *  with vehicleProfiles, every family `cartridges[]` entry must resolve. */
  registeredCartridgeNames?: string[];
}

function ok(errors: OntologyLintIssue[], warnings: OntologyLintIssue[]): OntologyLintResult {
  return { ok: errors.length === 0, errors, warnings };
}

export function lintOntology(params: LintOntologyParams): OntologyLintResult {
  const {
    ontology,
    dtcDictionary,
    mode06Dictionary,
    allowNonDtcSymptoms = [],
    cartridgeRequiredClasses = [],
    vehicleProfiles,
    registeredCartridgeNames,
  } = params;
  const errors: OntologyLintIssue[] = [];
  const warnings: OntologyLintIssue[] = [];

  const declaredSubtypes = new Set(Object.keys(ontology.subtypes));
  const declaredClasses = new Set(Object.keys(ontology.classes));
  const declaredViews = new Set(Object.keys(ontology.views));
  const symptomSubtypes = new Set(
    Object.entries(ontology.subtypes)
      .filter(([, parent]) => parent === "Symptom")
      .map(([name]) => name),
  );
  const conditionSubtypes = new Set(
    Object.entries(ontology.subtypes)
      .filter(([, parent]) => parent === "Condition")
      .map(([name]) => name),
  );

  // 1. Every DTC dictionary entry's concept must be a declared subtype.
  const conceptsCoveredByDtcs = new Set<string>();
  for (const [code, entry] of Object.entries(dtcDictionary.codes)) {
    if (!declaredSubtypes.has(entry.concept)) {
      errors.push({
        code: "dtc_unresolved_concept",
        message: `DTC ${code} maps to concept "${entry.concept}", which is not a declared class/subtype in dl-ontology.json`,
      });
      continue;
    }
    conceptsCoveredByDtcs.add(entry.concept);
  }

  // 2. Every declared Symptom subtype should be reachable from some DTC,
  //    unless explicitly allow-listed as PID/trend-driven instead.
  for (const symptom of symptomSubtypes) {
    if (conceptsCoveredByDtcs.has(symptom) || allowNonDtcSymptoms.includes(symptom)) continue;
    warnings.push({
      code: "orphan_symptom_class",
      message: `Symptom subtype "${symptom}" has no DTC dictionary entry and isn't in allowNonDtcSymptoms — no evidence path can ever assert it`,
    });
  }

  // 2b. Mode 06 dictionary concepts (when present) must be Condition subtypes.
  if (mode06Dictionary) {
    for (const [mid, entry] of Object.entries(mode06Dictionary.monitors)) {
      if (!entry.concept) continue;
      if (!conditionSubtypes.has(entry.concept) && !declaredSubtypes.has(entry.concept)) {
        errors.push({
          code: "mode06_unresolved_concept",
          message: `Mode 06 OBDMID ${mid} maps to concept "${entry.concept}", which is not a declared subtype in dl-ontology.json`,
        });
      } else if (!conditionSubtypes.has(entry.concept)) {
        errors.push({
          code: "mode06_concept_not_condition",
          message: `Mode 06 OBDMID ${mid} maps to "${entry.concept}", which must be a Condition subtype (failed monitors are conditions, not symptoms)`,
        });
      }
    }
  }

  // 3. Every view must only reference declared classes.
  for (const [viewName, view] of Object.entries(ontology.views)) {
    for (const className of view.classes) {
      if (!declaredClasses.has(className)) {
        errors.push({
          code: "view_references_unknown_class",
          message: `View "${viewName}" references class "${className}", which is not declared in dl-ontology.json's classes`,
        });
      }
    }
  }

  // 4. Every declared class should be reachable from at least one view
  //    (an unreachable fault class can never be recognized for any vehicle).
  const classesInAnyView = new Set(Object.values(ontology.views).flatMap((v) => v.classes));
  for (const className of declaredClasses) {
    if (!classesInAnyView.has(className)) {
      warnings.push({
        code: "class_not_in_any_view",
        message: `Class "${className}" is declared but not included in any view — no vehicle profile can ever recognize it`,
      });
    }
  }

  // 5. Cartridges may reference existing classes/subtypes only — never define new ones.
  for (const className of cartridgeRequiredClasses) {
    if (!declaredClasses.has(className) && !declaredSubtypes.has(className)) {
      errors.push({
        code: "cartridge_requires_unknown_class",
        message: `A cartridge requires class "${className}", which is not declared anywhere in dl-ontology.json`,
      });
    }
  }

  // 6. Vehicle profile registry wiring (when profiles are supplied).
  if (vehicleProfiles) {
    const familyIds = new Set(Object.keys(vehicleProfiles.engineFamilies));
    const cartridgeNames = registeredCartridgeNames ? new Set(registeredCartridgeNames) : undefined;

    for (const [vehicleId, vehicle] of Object.entries(vehicleProfiles.vehicles)) {
      if (!familyIds.has(vehicle.engineFamily)) {
        errors.push({
          code: "vehicle_unknown_engine_family",
          message: `Vehicle "${vehicleId}" references engineFamily "${vehicle.engineFamily}", which is not declared in vehicle-profiles.json engineFamilies`,
        });
      }
    }

    for (const [familyId, family] of Object.entries(vehicleProfiles.engineFamilies)) {
      if (!declaredViews.has(family.view)) {
        errors.push({
          code: "engine_family_unknown_view",
          message: `Engine family "${familyId}" references view "${family.view}", which is not declared in dl-ontology.json views`,
        });
      }
      if (cartridgeNames) {
        for (const name of family.cartridges) {
          if (!cartridgeNames.has(name)) {
            errors.push({
              code: "engine_family_unknown_cartridge",
              message: `Engine family "${familyId}" lists cartridge "${name}", which is not in the cartridge registry`,
            });
          }
        }
      }
    }
  }

  return ok(errors, warnings);
}
