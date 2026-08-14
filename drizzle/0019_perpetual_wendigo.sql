CREATE TABLE "bid_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"lot_number" text NOT NULL,
	"vin" text,
	"title" text NOT NULL,
	"image_url" text,
	"auction_at" timestamp with time zone,
	"max_bid_usd_cents" integer NOT NULL,
	"fee_usd_cents" integer NOT NULL,
	"plan_key_at_request" text,
	"client_note" text,
	"deposit_required_cents" integer DEFAULT 0 NOT NULL,
	"deposit_default_cents" integer DEFAULT 0 NOT NULL,
	"deposit_status" text DEFAULT 'not_required' NOT NULL,
	"deposit_override_by" uuid,
	"deposit_override_at" timestamp with time zone,
	"status" text DEFAULT 'requested' NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"decline_reason" text,
	"placed_at" timestamp with time zone,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_deposit_override_by_users_id_fk" FOREIGN KEY ("deposit_override_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_requests" ADD CONSTRAINT "bid_requests_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_requests_user_idx" ON "bid_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bid_requests_status_idx" ON "bid_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bid_requests_one_open_per_lot_idx" ON "bid_requests" USING btree ("user_id","platform","lot_number") WHERE status in ('requested', 'accepted', 'placed');