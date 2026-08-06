CREATE TABLE "site_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"maintenance" boolean DEFAULT false NOT NULL,
	"bypass_token_hash" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;