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
 * declared class, every view must reference real classes, and cartridges
 * must never require a class the ontology doesn't declare.
 */

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

export interface LintOntologyParams {
  ontology: LintableOntology;
  dtcDictionary: LintableDtcDictionary;
  /** Declared `Symptom` subtypes that are intentionally NOT DTC-driven (e.g. a
   *  future symptom inferred purely from PID trend, never a stored code). */
  allowNonDtcSymptoms?: string[];
  /** Union of every registered cartridge's `requires.classes` — checked so a
   *  cartridge can never silently reference a class the ontology dropped. */
  cartridgeRequiredClasses?: string[];
}

function ok(errors: OntologyLintIssue[], warnings: OntologyLintIssue[]): OntologyLintResult {
  return { ok: errors.length === 0, errors, warnings };
}

export function lintOntology(params: LintOntologyParams): OntologyLintResult {
  const { ontology, dtcDictionary, allowNonDtcSymptoms = [], cartridgeRequiredClasses = [] } = params;
  const errors: OntologyLintIssue[] = [];
  const warnings: OntologyLintIssue[] = [];

  const declaredSubtypes = new Set(Object.keys(ontology.subtypes));
  const declaredClasses = new Set(Object.keys(ontology.classes));
  const symptomSubtypes = new Set(
    Object.entries(ontology.subtypes)
      .filter(([, parent]) => parent === "Symptom")
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

  return ok(errors, warnings);
}
