/**
 * Zod contracts for everything obd-gateway, the UI, or a human can send the
 * API. Validation lives here — not scattered across route handlers — so
 * humans and the (future) agent hit the exact same gate.
 */
import { z } from "zod";

export const DtcStatusSchema = z.enum(["stored", "pending", "permanent"]);

export const DtcObservationSchema = z.object({
  code: z.string().regex(/^[PBCU][01][0-9A-F]{3}$/i, "must look like an OBD-II DTC, e.g. P0304"),
  status: DtcStatusSchema,
  ecu: z.string().optional(),
  description: z.string().optional(),
});

export const PidReadingSchema = z.object({
  pid: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  timestamp: z.string().min(1),
});

export const FreezeFrameSchema = z.object({
  dtc: z.string(),
  readings: z.array(PidReadingSchema),
});

export const Mode06ResultSchema = z.object({
  tid: z.string(),
  mid: z.string(),
  value: z.number(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  passed: z.boolean().nullable(),
});

export const ObservationSourceSchema = z.enum([
  "obd_gateway",
  "manual_entry",
  "simulated",
  "imported_file",
]);

export const ObservationBatchSchema = z.object({
  vehicleId: z.string().min(1),
  capturedAt: z.string().min(1),
  source: ObservationSourceSchema,
  odometerMiles: z.number().nonnegative().optional(),
  sessionId: z.string().min(1).optional(),
  dtcs: z.array(DtcObservationSchema).optional(),
  pids: z.array(PidReadingSchema).optional(),
  freezeFrames: z.array(FreezeFrameSchema).optional(),
  mode06: z.array(Mode06ResultSchema).optional(),
});
export type ObservationBatchInput = z.infer<typeof ObservationBatchSchema>;

export const StartDriveSessionSchema = z.object({
  vehicleId: z.string().min(1),
  label: z.string().optional(),
  source: ObservationSourceSchema.optional(),
  odometerStartMiles: z.number().nonnegative().optional(),
});
export type StartDriveSessionInput = z.infer<typeof StartDriveSessionSchema>;

export const EndDriveSessionSchema = z.object({
  sessionId: z.string().min(1),
  odometerEndMiles: z.number().nonnegative().optional(),
});
export type EndDriveSessionInput = z.infer<typeof EndDriveSessionSchema>;

export const SimulateDriveSessionSchema = z.object({
  vehicleId: z.string().min(1),
  label: z.string().optional(),
});
export type SimulateDriveSessionInput = z.infer<typeof SimulateDriveSessionSchema>;

export const ProblemStatementSchema = z.object({
  currentState: z.string().min(1),
  desiredState: z.string().min(1),
  gap: z.string().min(1),
  whyItMatters: z.string().optional(),
  urgency: z.enum(["low", "medium", "high", "critical"]).optional(),
  stakes: z.string().optional(),
});

export const CandidateActionSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  impact: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  infoGain: z.number().min(0).max(1).optional(),
  cost: z.number().min(0).max(1).optional(),
  risk: z.number().min(0).max(1).optional(),
  reversibility: z.number().min(0).max(1).optional(),
  alignment: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  violates: z.array(z.string()).optional(),
  firstStep: z.string().optional(),
  stopConditions: z.string().optional(),
});

export const CreateDiagnosticProblemSchema = z.object({
  vehicleId: z.string().min(1),
  statement: ProblemStatementSchema,
  triggeredByClass: z.string().optional(),
  gapType: z
    .enum([
      "knowledge",
      "resource",
      "skill",
      "design",
      "execution",
      "coordination",
      "measurement",
      "causal",
      "value",
      "constraint",
    ])
    .optional(),
  actions: z.array(CandidateActionSchema).default([]),
});
export type CreateDiagnosticProblemInput = z.infer<typeof CreateDiagnosticProblemSchema>;

export const LogRepairSchema = z.object({
  vehicleId: z.string().min(1),
  problemId: z.string().min(1),
  actionId: z.string().min(1),
  rationale: z.string().min(1),
  decidedBy: z.string().min(1),
  outcomeStatus: z.enum(["worked", "partial", "failed", "inconclusive"]).optional(),
  note: z.string().optional(),
});
export type LogRepairInput = z.infer<typeof LogRepairSchema>;

export const ProblemIdActionSchema = z.object({
  problemId: z.string().min(1),
  note: z.string().optional(),
});
export type ProblemIdActionInput = z.infer<typeof ProblemIdActionSchema>;

export const CreateVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().nullable().optional(),
  trim: z.string().nullable().optional(),
  engineFamily: z.string().min(1),
  vin: z.string().optional(),
  obdProtocol: z.string().nullable().optional(),
  odometerMiles: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;

export const RecommendationStatusSchema = z.enum([
  "new",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "converted_to_repair",
  "dismissed",
]);

export const MarkRecommendationStatusSchema = z.object({
  status: RecommendationStatusSchema,
});
export type MarkRecommendationStatusInput = z.infer<typeof MarkRecommendationStatusSchema>;

export const StartSpecialProcedureSchema = z.object({
  vehicleId: z.string().min(1),
  procedureId: z.string().min(1),
  decidedBy: z.string().min(1).default("operator"),
  note: z.string().optional(),
});
export type StartSpecialProcedureInput = z.infer<typeof StartSpecialProcedureSchema>;

export const CompleteSpecialProcedureSchema = z.object({
  vehicleId: z.string().min(1),
  problemId: z.string().min(1),
  procedureId: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  decidedBy: z.string().min(1).default("operator"),
  note: z.string().optional(),
});
export type CompleteSpecialProcedureInput = z.infer<typeof CompleteSpecialProcedureSchema>;

/** Portable garage JSON dump (export / import). Nested entities are lightly gated. */
export const GarageDumpSchema = z.object({
  format: z.literal("auto-architect.garage"),
  version: z.literal(1),
  exportedAt: z.string().min(1),
  scope: z.enum(["garage", "vehicle"]),
  vehicleId: z.string().nullable(),
  vehicles: z.array(
    z
      .object({
        id: z.string().min(1),
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number().nullable(),
        trim: z.string().nullable(),
        engineFamily: z.string().min(1),
      })
      .passthrough(),
  ),
  observations: z.array(ObservationBatchSchema),
  problems: z.array(
    z
      .object({
        id: z.string().min(1),
        vehicleId: z.string().min(1),
        status: z.string().min(1),
        statement: z.object({
          currentState: z.string(),
          desiredState: z.string(),
          gap: z.string(),
        }),
        actions: z.array(z.unknown()),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
      })
      .passthrough(),
  ),
  decisions: z.array(
    z
      .object({
        id: z.string().min(1),
        vehicleId: z.string().min(1),
        problemId: z.string().min(1),
        actionId: z.string().min(1),
        rationale: z.string(),
        policyAllowed: z.boolean(),
        decidedAt: z.string().min(1),
        decidedBy: z.string().min(1),
      })
      .passthrough(),
  ),
  recommendations: z
    .array(
      z
        .object({
          id: z.string().min(1),
          vehicleId: z.string().min(1),
        })
        .passthrough(),
    )
    .default([]),
});
export type GarageDumpInput = z.infer<typeof GarageDumpSchema>;
