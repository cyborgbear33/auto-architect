CREATE TABLE IF NOT EXISTS "drive_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_sessions_vehicle_idx" ON "drive_sessions" USING btree ("vehicle_id");
