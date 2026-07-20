CREATE TABLE IF NOT EXISTS "discovery_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discovery_reports_vehicle_captured_idx" ON "discovery_reports" USING btree ("vehicle_id","captured_at");
