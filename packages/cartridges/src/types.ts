import type { CandidateAction, DtcObservation, GapType } from "@auto/semantic-types";

/** One ABox assertion set: named concept individuals + typed role edges. */
export interface AboxAssertions {
  concepts: Record<string, string[]>;
  roles: Array<[string, string, string]>;
}

/**
 * A perception rule turns raw OBD-II evidence into ABox edges. Exactly one of
 * `dtcConcept`, `pid`, or `mode06Concept` is set.
 */
export interface PerceptionRule {
  /** Assert `concept` whenever any active DTC maps (via the dictionary) to this Symptom concept. */
  dtcConcept?: string;
  /** Assert `concept` when this PID's latest value satisfies `when`. */
  pid?: string;
  when?: { gt?: number; gte?: number; lt?: number; lte?: number };
  /**
   * Assert `concept` when any Mode 06 row with `passed: false` maps (via the
   * Mode 06 dictionary) to this Condition concept. Unknown OBDMIDs never match.
   */
  mode06Concept?: string;
  /** The DL concept individual to assert (must already exist in dl-ontology.json). */
  concept: string;
  as: "symptom" | "condition" | "trend";
  /** Stable per-vehicle individual name suffix (e.g. "cylinder-misfire"). */
  slot: string;
}

/** The vehicle-scoped view a framing rule's `build` function receives. */
export interface VehicleView {
  vehicleId: string;
  label: string;
  engineFamily: string;
  dtcs: DtcObservation[];
  pids: Record<string, number>;
}

export interface FramingResult {
  label: string;
  statement: {
    currentState: string;
    desiredState: string;
    gap: string;
    whyItMatters?: string;
    urgency?: "low" | "medium" | "high" | "critical";
  };
  gapType: GapType;
  /** Explicit success criteria — LOGOS `solve` escalates to `clarify-values` without this. */
  desiredState: {
    successCriteria: string;
    measurement?: string;
  };
  actions: CandidateAction[];
}

export interface FramingRule {
  whenClass: string;
  priority: number;
  build: (vehicle: VehicleView) => FramingResult;
}

export interface Cartridge {
  name: string;
  perception: PerceptionRule[];
  framing: FramingRule[];
  requires: {
    classes: string[];
    dtcConcepts?: string[];
    pids?: string[];
    /** Mode 06 Condition concepts this cartridge perceives / frames. */
    mode06Concepts?: string[];
  };
}
