import { listCascadeEdges } from "@auto/ontology";
import type {
  CascadeAntecedentRef,
  CascadeBand,
  CascadeEdge,
  CascadePrognosis,
  CascadeWatchItem,
} from "@auto/semantic-types";
import { nowIso } from "../lib/ids.ts";
import type { Store } from "../store/index.ts";
import type { ForecastService } from "./forecast.ts";
import type { RecognitionService } from "./recognition.ts";
import type { VehicleService } from "./vehicle.ts";

const ACTIVE_PROBLEM = new Set(["open", "analyzing", "verifying"]);

const BAND_RANK: Record<CascadeBand, number> = {
  High: 3,
  Elevated: 2,
  Watch: 1,
};

/**
 * On-command cascade prognosis (F6/F7/F8). Matches curated edges against proven
 * classes, flagged trends, open problem classes, and operator-entered wear
 * stages. Propose-only — never invents realize membership or actuarial %.
 */
export class CascadePrognosisService {
  constructor(
    private store: Store,
    private vehicles: VehicleService,
    private recognition: RecognitionService,
    private forecast: ForecastService,
  ) {}

  async forVehicle(vehicleId: string): Promise<CascadePrognosis> {
    const vehicle = await this.vehicles.getOrThrow(vehicleId);
    const recognition = await this.recognition.recognize(vehicleId);
    const forecast = await this.forecast.summary(vehicleId);
    const problems = await this.store.problems.listByVehicle(vehicleId);

    const proven = new Set(recognition.mostSpecific);
    const members = new Set(recognition.member);
    const trends = new Set(forecast.recognitionTrends);
    const openClasses = new Set(
      problems
        .filter((p) => ACTIVE_PROBLEM.has(p.status) && p.triggeredByClass)
        .map((p) => p.triggeredByClass as string),
    );
    const manualConditions = new Set((vehicle.manualConditions ?? []).map((c) => c.id));

    const items: CascadeWatchItem[] = [];
    for (const edge of listCascadeEdges()) {
      if (!familyAllows(edge, vehicle.engineFamily)) continue;
      const match = matchAntecedent(edge.antecedent, {
        proven,
        members,
        trends,
        openClasses,
        manualConditions,
      });
      if (!match) continue;
      // Don't watch a class that's already proven now — operator already knows.
      if (proven.has(edge.consequent.id) || members.has(edge.consequent.id)) continue;

      items.push({
        edgeId: edge.id,
        band: edge.band,
        consequentClass: edge.consequent.id,
        rationale: edge.rationale,
        ...(edge.horizon ? { horizon: edge.horizon } : {}),
        matchedAntecedent: edge.antecedent,
        evidence: match.evidence,
      });
    }

    items.sort((a, b) => {
      const band = BAND_RANK[b.band] - BAND_RANK[a.band];
      if (band !== 0) return band;
      return a.consequentClass.localeCompare(b.consequentClass) || a.edgeId.localeCompare(b.edgeId);
    });

    return {
      vehicleId,
      generatedAt: nowIso(),
      items,
      ...(items.length === 0
        ? {
            emptyReason:
              "No curated cascade edges match current proven classes, flagged trends, open cases, or operator conditions.",
          }
        : {}),
    };
  }
}

function familyAllows(edge: CascadeEdge, engineFamily: string): boolean {
  const families = edge.engineFamilies;
  if (families == null || families.length === 0) return true;
  return families.includes(engineFamily);
}

function matchAntecedent(
  antecedent: CascadeAntecedentRef,
  ctx: {
    proven: Set<string>;
    members: Set<string>;
    trends: Set<string>;
    openClasses: Set<string>;
    manualConditions: Set<string>;
  },
): { evidence: string[] } | null {
  switch (antecedent.kind) {
    case "provenClass":
      if (ctx.proven.has(antecedent.id) || ctx.members.has(antecedent.id)) {
        return { evidence: [`Proven / member: ${antecedent.id}`] };
      }
      return null;
    case "trend":
      if (ctx.trends.has(antecedent.id)) {
        return { evidence: [`Flagged trend: ${antecedent.id}`] };
      }
      return null;
    case "openProblemClass":
      if (ctx.openClasses.has(antecedent.id)) {
        return { evidence: [`Open diagnostic case for ${antecedent.id}`] };
      }
      return null;
    case "manualCondition":
      if (ctx.manualConditions.has(antecedent.id)) {
        return { evidence: [`Operator condition: ${antecedent.id}`] };
      }
      return null;
    default:
      return null;
  }
}
