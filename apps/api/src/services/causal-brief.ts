/**
 * A7 — apprentice causal brief read-model.
 * Compose CausalModel + AEMF + recognition narration + solution/learning history + OEM guidance (R6).
 * Never invents realize membership or confirmed root causes.
 */
import { composeCausalModel, composeClassEvidence, draftForClass } from "@auto/cartridges";
import { aemfPlaybookProse, oemGuidanceAppliesToClass, type TsbEntry } from "@auto/ontology";
import type {
  CausalBrief,
  CausalModel,
  KnownCampaign,
  OemGuidanceNote,
  SolutionHistory,
} from "@auto/semantic-types";
import { notFound, validationError } from "../lib/errors.ts";
import type { Store } from "../store/index.ts";
import type { CampaignService } from "./campaigns.ts";
import type { LearningCycleService } from "./learning-cycles.ts";
import type { RecognitionService } from "./recognition.ts";
import type { SolutionHistoryService } from "./solution-history.ts";
import type { VehicleService } from "./vehicle.ts";

export const CAUSAL_BRIEF_INTEGRITY =
  "Teaching brief only — fault-class membership stays LOGOS-proven from OBD evidence; empty DTCs are not healthy. OEM campaign/TSB notes are applicability only.";

export const OEM_APPLICABILITY =
  "Applicability only — not a LOGOS-proven fault class.";

export function historyNotesFromSolutionHistory(history: SolutionHistory): string[] {
  const notes: string[] = [];
  // X6 — prefer narrative lessons over bare n= rollups when present.
  for (const n of (history.narratives ?? []).slice(0, 3)) {
    notes.push(n.lesson);
  }
  if (notes.length === 0) {
    for (const b of history.vehicle.filter((x) => x.worked > 0).slice(0, 3)) {
      notes.push(
        `On this vehicle, ${b.actionId} worked ${b.worked}/${b.totalWithOutcome} time(s) for ${b.faultClass ?? "this class"} (n=${b.totalWithOutcome}).`,
      );
    }
  }
  if (notes.length === 0) {
    for (const b of history.engineFamilyRollup.filter((x) => x.worked > 0).slice(0, 2)) {
      notes.push(
        `On engine family ${b.engineFamily}, ${b.actionId} worked ${b.worked}/${b.totalWithOutcome} (family prior; treat small n carefully).`,
      );
    }
  }
  if (notes.length === 0) {
    notes.push("No confirmed repair outcomes for this class on this vehicle yet — priors are cartridge defaults.");
  }
  return notes;
}

export function whatToProveNextFromModel(
  model: CausalModel,
  actionDescriptions: string[],
): string[] {
  const fromActions = actionDescriptions.slice(0, 3);
  if (fromActions.length > 0) return fromActions;
  return (model.mostLikelyCauses ?? []).slice(0, 2).map((c) => `Prove or rule out: ${c}`);
}

/** R6 — filter matched campaigns/TSBs that declare relatedClasses for this fault class. */
export function oemAlsoSaysForClass(
  faultClass: string,
  campaigns: KnownCampaign[],
  tsbs: TsbEntry[],
): OemGuidanceNote[] {
  const notes: OemGuidanceNote[] = [];
  for (const c of campaigns) {
    if (!oemGuidanceAppliesToClass(c.relatedClasses, faultClass)) continue;
    const steps = c.steps?.length ? c.steps : [c.summary];
    notes.push({
      id: c.id,
      title: c.title,
      kind: "campaign",
      steps,
      ...(c.reference ? { reference: c.reference } : {}),
      applicabilityNote: OEM_APPLICABILITY,
    });
  }
  for (const t of tsbs) {
    if (!oemGuidanceAppliesToClass(t.relatedClasses, faultClass)) continue;
    const steps = t.steps?.length ? t.steps : [t.summary];
    notes.push({
      id: t.id,
      title: t.title,
      kind: "tsb",
      steps,
      reference: t.reference,
      applicabilityNote: OEM_APPLICABILITY,
    });
  }
  return notes;
}

export function composeCausalBriefSections(input: {
  vehicleId: string;
  faultClass: string;
  problemId?: string;
  causalModel: CausalModel;
  fluent?: string;
  aemfPlaybook?: string;
  historyNotes: string[];
  proveNext: string[];
  gap?: string;
  operatorComplaints?: string[];
  oemAlsoSays?: OemGuidanceNote[];
}): CausalBrief {
  const likely = input.causalModel.mostLikelyCauses?.[0];
  const why = likely
    ? `Most likely: ${likely}${input.gap ? ` — gap: ${input.gap}` : ""}`
    : (input.gap ?? `Differential open for ${input.faultClass} — isolate cause before parts.`);

  const howWeKnow = [
    ...(input.fluent ? [input.fluent] : []),
    ...(input.causalModel.symptoms ?? []),
    ...(input.operatorComplaints ?? []).map((c) => `Operator reports: ${c}`),
  ].filter(Boolean);

  return {
    vehicleId: input.vehicleId,
    faultClass: input.faultClass,
    ...(input.problemId ? { problemId: input.problemId } : {}),
    why,
    howWeKnow: howWeKnow.length > 0 ? howWeKnow : [`Class ${input.faultClass} is in scope; capture more OBD evidence.`],
    whatToProveNext: input.proveNext,
    ...(input.aemfPlaybook ? { aemfPlaybook: input.aemfPlaybook } : {}),
    historyNotes: input.historyNotes,
    ...(input.operatorComplaints?.length ? { operatorComplaints: input.operatorComplaints } : {}),
    ...(input.oemAlsoSays?.length ? { oemAlsoSays: input.oemAlsoSays } : {}),
    causalModel: input.causalModel,
    integrityNote: CAUSAL_BRIEF_INTEGRITY,
  };
}

export class CausalBriefService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private solutionHistory: SolutionHistoryService,
    private learningCycles: LearningCycleService,
    private campaigns: CampaignService,
  ) {}

  async forProblem(problemId: string): Promise<CausalBrief> {
    const problem = await this.store.problems.get(problemId);
    if (!problem) throw notFound("DiagnosticProblem", problemId);
    if (!problem.triggeredByClass) {
      throw validationError("Causal brief requires a problem with triggeredByClass.");
    }
    return this.forClass(
      problem.vehicleId,
      problem.triggeredByClass,
      problemId,
      problem.causalModel,
      problem.operatorComplaints,
    );
  }

  async forClass(
    vehicleId: string,
    faultClass: string,
    problemId?: string,
    existingModel?: CausalModel,
    operatorComplaints?: string[],
  ): Promise<CausalBrief> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const cartridges = this.vehicles.cartridgesFor(vehicle);
    const dtcs = await this.store.observations.latestDtcs(vehicleId);
    const pids = await this.store.observations.latestPids(vehicleId);
    const vehicleView = {
      vehicleId: vehicle.id,
      label: `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.trim ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      engineFamily: vehicle.engineFamily,
      dtcs,
      pids,
    };

    const draft = draftForClass(vehicleView, faultClass, cartridges);
    if (!draft && !existingModel) {
      throw validationError(`No cartridge frames class "${faultClass}" for causal brief.`);
    }

    const evidence = composeClassEvidence(
      faultClass,
      cartridges,
      dtcs,
      pids,
      await this.store.observations.latestFreezeFrames(vehicleId),
      await this.store.observations.latestMode06(vehicleId),
    );

    const causalModel =
      existingModel ??
      (draft
        ? composeCausalModel({ draft, evidence })
        : { symptoms: evidence.dtcs.map((d) => d.code), possibleCauses: [], mostLikelyCauses: [] });

    const recognition = await this.recognition.recognize(vehicleId);
    const fluent = recognition.narration.find((n) => n.className === faultClass)?.fluent;
    const history = await this.solutionHistory.forVehicle(vehicleId, faultClass);
    const cycles = await this.learningCycles.forVehicle(vehicleId, problemId);
    const historyNotes = historyNotesFromSolutionHistory(history);
    const prior = cycles.cycles.find((c) => c.faultClass === faultClass && c.priorDelta?.explain);
    if (prior?.priorDelta?.explain) {
      historyNotes.unshift(`Calibration: ${prior.priorDelta.explain}`);
    }

    const proveNext = whatToProveNextFromModel(
      causalModel,
      (draft?.actions ?? [])
        .filter((a) => a.tags?.includes("diagnostic") || a.tags?.includes("measure"))
        .sort((a, b) => (b.infoGain ?? 0) - (a.infoGain ?? 0))
        .map((a) => a.description?.trim() || a.id)
        .filter(Boolean),
    );

    const pack = await this.campaigns.forVehicle(vehicleId);
    const oemAlsoSays = oemAlsoSaysForClass(faultClass, pack.campaigns, pack.tsbs);

    return composeCausalBriefSections({
      vehicleId,
      faultClass,
      problemId,
      causalModel,
      fluent,
      aemfPlaybook: aemfPlaybookProse(faultClass),
      historyNotes,
      proveNext,
      gap: draft?.statement.gap,
      operatorComplaints,
      oemAlsoSays,
    });
  }
}
