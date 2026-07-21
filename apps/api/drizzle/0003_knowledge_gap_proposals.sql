CREATE TABLE IF NOT EXISTS "knowledge_gap_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"status" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_gap_proposals_vehicle_idx" ON "knowledge_gap_proposals" USING btree ("vehicle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_gap_proposals_vehicle_dedupe_idx" ON "knowledge_gap_proposals" USING btree ("vehicle_id","dedupe_key");
