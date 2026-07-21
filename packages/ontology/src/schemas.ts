/**
 * Zod shapes for source-controlled ontology registries. `tsc` + JSON imports
 * only prove the files parse as JSON — these schemas prove the fields we
 * actually depend on (engineFamily → view → cartridges, DTC concept rows).
 */
import { z } from "zod";

export const DtcDictionaryEntrySchema = z.object({
  description: z.string().min(1),
  concept: z.string().min(1),
  sae: z.boolean(),
  engineFamily: z.string().min(1).optional(),
  note: z.string().optional(),
});

export const DtcDictionaryFileSchema = z.object({
  disclaimer: z.string().optional(),
  codes: z.record(DtcDictionaryEntrySchema),
});

/** Thin SAE J1979 seed rows — not a full PID table. */
export const PidDictionaryEntrySchema = z
  .object({
    description: z.string().min(1),
    unit: z.string().min(1),
    sae: z.boolean(),
    mode: z.enum(["01"]).optional(),
    pidHex: z
      .string()
      .regex(/^0x[0-9A-Fa-f]{2}$/, "expected Mode 01 hex like 0x04")
      .optional(),
    manualOnly: z.boolean().optional(),
    note: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.manualOnly) {
      if (entry.mode !== undefined || entry.pidHex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "manualOnly PIDs must not claim Mode 01 mode/pidHex",
        });
      }
      return;
    }
    if (entry.mode === undefined || entry.pidHex === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "standard Mode 01 PIDs require mode and pidHex",
      });
    }
  });

export const PidDictionaryFileSchema = z.object({
  disclaimer: z.string().optional(),
  pids: z.record(PidDictionaryEntrySchema),
});

/** Thin SAE/ISO CAN Mode $06 OBDMID seed — not a full Annex D paste. */
export const Mode06DictionaryEntrySchema = z.object({
  description: z.string().min(1),
  /** Condition subtype asserted when this monitor reports `passed: false`. Omit for label-only rows. */
  concept: z.string().min(1).optional(),
  sae: z.boolean(),
  note: z.string().optional(),
});

export const Mode06DictionaryFileSchema = z.object({
  disclaimer: z.string().optional(),
  monitors: z.record(Mode06DictionaryEntrySchema),
});

export const VehicleProfileEntrySchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().nullable(),
  trim: z.string().nullable(),
  engineFamily: z.string().min(1),
  obdProtocol: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export const EngineFamilyEntrySchema = z.object({
  label: z.string().min(1),
  view: z.string().min(1),
  cartridges: z.array(z.string().min(1)),
});

export const VehicleProfilesFileSchema = z.object({
  vehicles: z.record(VehicleProfileEntrySchema),
  engineFamilies: z.record(EngineFamilyEntrySchema),
});

export const CampaignEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  engineFamily: z.string().min(1),
  yearRange: z.tuple([z.number().int(), z.number().int()]),
  summary: z.string().min(1),
  reference: z.string().min(1),
});

export const TsbEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  engineFamily: z.string().min(1),
  summary: z.string().min(1),
  reference: z.string().min(1),
});

export const KnownCampaignsFileSchema = z.object({
  campaigns: z.array(CampaignEntrySchema),
  tsbs: z.array(TsbEntrySchema),
});

export const SpecialProcedureModuleSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
});

export const SpecialProcedureEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  engineFamily: z.string().min(1),
  executionMode: z.enum(["external_enhanced_tool", "gateway_bidirectional"]),
  summary: z.string().min(1),
  triggers: z.array(z.string().min(1)).min(1),
  modulesInvolved: z.array(SpecialProcedureModuleSchema).min(1),
  detectSteps: z.array(z.string().min(1)).min(1),
  alignSteps: z.array(z.string().min(1)).min(1),
  verifySteps: z.array(z.string().min(1)).min(1),
  hardware: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1),
  references: z.array(z.string().min(1)).min(1),
});

export const SpecialProceduresFileSchema = z.object({
  disclaimer: z.string().optional(),
  procedures: z.array(SpecialProcedureEntrySchema),
});

export const ManualConditionCatalogEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  system: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const ManualConditionsFileSchema = z.object({
  disclaimer: z.string().optional(),
  conditions: z.array(ManualConditionCatalogEntrySchema).min(1),
});

export type ManualConditionsFile = z.infer<typeof ManualConditionsFileSchema>;
export type ManualConditionCatalogEntry = z.infer<typeof ManualConditionCatalogEntrySchema>;

export const CascadeAntecedentSchema = z.object({
  kind: z.enum(["provenClass", "trend", "openProblemClass", "manualCondition"]),
  id: z.string().min(1),
});

export const CascadeConsequentSchema = z.object({
  kind: z.literal("watchClass"),
  id: z.string().min(1),
});

export const CascadeEdgeSchema = z.object({
  id: z.string().min(1),
  antecedent: CascadeAntecedentSchema,
  consequent: CascadeConsequentSchema,
  band: z.enum(["Watch", "Elevated", "High"]),
  rationale: z.string().min(1),
  horizon: z.string().min(1).optional(),
  engineFamilies: z.array(z.string().min(1)).nullable().optional(),
});

export const CascadeEdgesFileSchema = z.object({
  disclaimer: z.string().optional(),
  edges: z.array(CascadeEdgeSchema),
});

export type CascadeEdgesFile = z.infer<typeof CascadeEdgesFileSchema>;

export type DtcDictionaryFile = z.infer<typeof DtcDictionaryFileSchema>;
export type PidDictionaryFile = z.infer<typeof PidDictionaryFileSchema>;
export type PidDictionaryEntry = z.infer<typeof PidDictionaryEntrySchema>;
export type Mode06DictionaryFile = z.infer<typeof Mode06DictionaryFileSchema>;
export type Mode06DictionaryEntry = z.infer<typeof Mode06DictionaryEntrySchema>;
export type VehicleProfilesFile = z.infer<typeof VehicleProfilesFileSchema>;
export type KnownCampaignsFile = z.infer<typeof KnownCampaignsFileSchema>;
export type SpecialProcedureEntry = z.infer<typeof SpecialProcedureEntrySchema>;
export type SpecialProceduresFile = z.infer<typeof SpecialProceduresFileSchema>;
