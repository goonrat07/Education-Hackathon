CREATE TABLE "ai_usage_total" (
	"day" date PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "studied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "check_unavailable" boolean DEFAULT false NOT NULL;