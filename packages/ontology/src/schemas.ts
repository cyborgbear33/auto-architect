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

export type DtcDictionaryFile = z.infer<typeof DtcDictionaryFileSchema>;
export type VehicleProfilesFile = z.infer<typeof VehicleProfilesFileSchema>;
export type KnownCampaignsFile = z.infer<typeof KnownCampaignsFileSchema>;
