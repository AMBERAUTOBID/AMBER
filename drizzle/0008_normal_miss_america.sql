CREATE TABLE "auction_ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"is_partial" boolean DEFAULT true NOT NULL,
	"watermark" timestamp with time zone,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"lots_seen" integer DEFAULT 0 NOT NULL,
	"lots_written" integer DEFAULT 0 NOT NULL,
	"lots_skipped" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "auction_ingest_runs_kind_started_idx" ON "auction_ingest_runs" USING btree ("kind","started_at");