/**
 * Read-only problem index. Rows are fault classes the DL views can name, plus
 * operator-entered inspection conditions. Nothing here proves a fault on a vehicle.
 */
import type { CascadeBand } from "@auto/semantic-types";
import cascadeEdgesJson from "../cascade-edges.json" with { type: "json" };
import dlOntologyJson from "../dl-ontology.json" with { type: "json" };
import dtcDictionaryJson from "../dtc-dictionary.json" with { type: "json" };
import knownCampaignsJson from "../known-campaigns.json" with { type: "json" };
import manualConditionsJson from "../manual-conditions.json" with { type: "json" };
import vehicleProfilesJson from "../vehicle-profiles.json" with { type: "json" };
import vehicleSystemAspectsJson from "../vehicle-system-aspects.json" with { type: "json" };

export type ProblemCatalogKind = "fault-class" | "inspection";

export interface ProblemCatalogCategory {
  id: string;
  label: string;
}

export interface ProblemCatalogLink {
  id: string;
  label: string;
  band: CascadeBand;
  /** Set when the edge applies only to some engine families. */
  engineFamilies: string[] | null;
}

export interface ProblemCatalogRow {
  id: string;
  label: string;
  kind: ProblemCatalogKind;
  categories: ProblemCatalogCategory[];
  /** Shop definition from the ontology notes or the inspection description. */
  definition: string;
  /** How to approach it, when a playbook note exists. */
  approach: string | null;
  codes: string[];
  followsFrom: ProblemCatalogLink[];
  leadsTo: ProblemCatalogLink[];
  bulletins: string[];
}

interface ClassDef {
  equivalentTo?: string;
}

const classes = dlOntologyJson.classes as Record<string, ClassDef>;
const notes = dlOntologyJson.notes as Record<string, string>;
const views = dlOntologyJson.views as Record<string, { classes: string[] }>;
const families = vehicleProfilesJson.engineFamilies as Record<string, { view: string }>;
const aspectsByClass = vehicleSystemAspectsJson.byClass as Record<string, string[]>;
const aspectLabels = vehicleSystemAspectsJson.aspects as Record<string, { label: string }>;
const playbookNotes = (vehicleSystemAspectsJson.playbookNotes ?? {}) as Record<string, string>;

const codesByConcept = new Map<string, string[]>();
for (const [code, entry] of Object.entries(dtcDictionaryJson.codes)) {
  const list = codesByConcept.get(entry.concept) ?? [];
  list.push(code);
  codesByConcept.set(entry.concept, list);
}

function shopLabel(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
  return words
    .map((word, index) => {
      if (index === 0) return word;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return word.toLowerCase();
    })
    .join(" ");
}

function pushLink(list: ProblemCatalogLink[], link: ProblemCatalogLink): void {
  if (list.some((existing) => existing.id === link.id)) return;
  list.push(link);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function conceptsIn(definition: string, role: string): string[] {
  return unique(
    [...definition.matchAll(new RegExp(`has${role}\\.(\\w+)`, "g"))].map((m) => m[1] ?? ""),
  );
}

function viewClassIds(engineFamilyId?: string): string[] {
  if (!engineFamilyId) {
    const ids = new Set<string>();
    for (const view of Object.values(views)) {
      for (const id of view.classes) ids.add(id);
    }
    return [...ids];
  }
  const viewId = families[engineFamilyId]?.view;
  return viewId ? [...(views[viewId]?.classes ?? [])] : [];
}

function categoriesForClass(classId: string): ProblemCatalogCategory[] {
  return (aspectsByClass[classId] ?? []).map((id) => ({
    id,
    label: aspectLabels[id]?.label ?? shopLabel(id),
  }));
}

function bulletinsFor(classId: string, engineFamilyId?: string): string[] {
  const cited = [...knownCampaignsJson.campaigns, ...knownCampaignsJson.tsbs];
  return cited
    .filter((row) => row.relatedClasses?.includes(classId))
    .filter((row) => !engineFamilyId || row.engineFamily === engineFamilyId)
    .map((row) => row.id);
}

interface RawEdge {
  antecedent: { kind: string; id: string };
  consequent: { kind: string; id: string };
  band: CascadeBand;
  engineFamilies?: string[] | null;
}

function edgeApplies(edge: RawEdge, engineFamilyId?: string): boolean {
  if (!engineFamilyId) return true;
  const limited = edge.engineFamilies;
  if (!limited || limited.length === 0) return true;
  return limited.includes(engineFamilyId);
}

export function listProblemCatalog(engineFamilyId?: string): ProblemCatalogRow[] {
  const labelOf = new Map<string, string>();
  const rows: ProblemCatalogRow[] = [];

  for (const id of viewClassIds(engineFamilyId).sort()) {
    const definitionText = classes[id]?.equivalentTo ?? "";
    const dtcConcepts = conceptsIn(definitionText, "Dtc");
    const codes = dtcConcepts.flatMap((concept) => codesByConcept.get(concept) ?? []).sort();
    const label = shopLabel(id);
    labelOf.set(id, label);
    rows.push({
      id,
      label,
      kind: "fault-class",
      categories: categoriesForClass(id),
      definition: notes[id] ?? "",
      approach: playbookNotes[id] ?? null,
      codes,
      followsFrom: [],
      leadsTo: [],
      bulletins: bulletinsFor(id, engineFamilyId),
    });
  }

  for (const condition of manualConditionsJson.conditions) {
    const label = condition.label;
    labelOf.set(condition.id, label);
    rows.push({
      id: condition.id,
      label,
      kind: "inspection",
      categories: [
        {
          id: `system:${condition.system}`,
          label: condition.system.charAt(0).toUpperCase() + condition.system.slice(1),
        },
      ],
      definition: condition.description,
      approach: null,
      codes: [],
      followsFrom: [],
      leadsTo: [],
      bulletins: [],
    });
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const edge of cascadeEdgesJson.edges as RawEdge[]) {
    if (!edgeApplies(edge, engineFamilyId)) continue;
    const familiesOnEdge =
      edge.engineFamilies && edge.engineFamilies.length > 0 ? edge.engineFamilies : null;
    const from = byId.get(edge.antecedent.id);
    const to = byId.get(edge.consequent.id);
    const linkTo: ProblemCatalogLink = {
      id: edge.consequent.id,
      label: labelOf.get(edge.consequent.id) ?? shopLabel(edge.consequent.id),
      band: edge.band,
      engineFamilies: familiesOnEdge,
    };
    const linkFrom: ProblemCatalogLink = {
      id: edge.antecedent.id,
      label: labelOf.get(edge.antecedent.id) ?? shopLabel(edge.antecedent.id),
      band: edge.band,
      engineFamilies: familiesOnEdge,
    };
    if (from) pushLink(from.leadsTo, linkTo);
    if (to) pushLink(to.followsFrom, linkFrom);
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/** Search text and category chip to open the lookup on one known problem. */
export function problemLookupPrefill(
  problemId: string,
): { search: string; category: string } | null {
  const row = listProblemCatalog().find((entry) => entry.id === problemId);
  if (!row) return null;
  return {
    search: row.label,
    category: row.categories.length === 1 ? (row.categories[0]?.id ?? "all") : "all",
  };
}

export function problemCatalogCategories(rows: ProblemCatalogRow[]): ProblemCatalogCategory[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const category of row.categories) seen.set(category.id, category.label);
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
