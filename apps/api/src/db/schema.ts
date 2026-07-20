/**
 * Drizzle schema — Postgres production storage for the Store seam.
 *
 * Queried fields (id, vehicleId, capturedAt) are columns; nested domain
 * payloads (DTCs, PID series, problem statements, solutions) stay JSONB so
 * the API types in @auto/semantic-types remain the source of truth.
 */

import type {
  DecisionRecord,
  DiagnosticProblem,
  ObservationBatch,
  Recommendation,
  VehicleProfile,
} from "@auto/semantic-types";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const tz = { withTimezone: true, mode: "string" as const };

export const vehicles = pgTable("vehicles", {
  id: text("id").primaryKey(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year"),
  trim: text("trim"),
  engineFamily: text("engine_family").notNull(),
  /** Full VehicleProfile — optional fields (vin, notes, odometer, …) live here. */
  payload: jsonb("payload").$type<VehicleProfile>().notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const observationBatches = pgTable(
  "observation_batches",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id").notNull(),
    capturedAt: timestamp("captured_at", tz).notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").$type<ObservationBatch>().notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => ({
    vehicleCapturedIdx: index("obs_batches_vehicle_captured_idx").on(t.vehicleId, t.capturedAt),
  }),
);

export const problems = pgTable(
  "problems",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<DiagnosticProblem>().notNull(),
    createdAt: timestamp("created_at", tz).notNull(),
    updatedAt: timestamp("updated_at", tz).notNull(),
  },
  (t) => ({
    vehicleIdx: index("problems_vehicle_idx").on(t.vehicleId),
  }),
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Recommendation>().notNull(),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => ({
    vehicleIdx: index("recommendations_vehicle_idx").on(t.vehicleId),
  }),
);

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id").notNull(),
    problemId: text("problem_id").notNull(),
    payload: jsonb("payload").$type<DecisionRecord>().notNull(),
    decidedAt: timestamp("decided_at", tz).notNull(),
  },
  (t) => ({
    vehicleIdx: index("decisions_vehicle_idx").on(t.vehicleId),
  }),
);

export const schema = {
  vehicles,
  observationBatches,
  problems,
  recommendations,
  decisions,
};
