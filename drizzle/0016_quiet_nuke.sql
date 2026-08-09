CREATE TABLE "order_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible_to_client" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"source_url" text,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" bigint,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible_to_client" boolean DEFAULT true NOT NULL,
	"uploaded_at" timestamp with time zone,
	"import_error" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"note" text,
	"visible_to_client" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"happened_at" timestamp with time zone NOT NULL,
	"note" text,
	"note_visible_to_client" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"auction_name" text,
	"lot_number" text NOT NULL,
	"vin" text,
	"year" integer,
	"make" text,
	"model" text,
	"series" text,
	"color" text,
	"odometer" integer,
	"odometer_unit" text,
	"primary_damage" text,
	"secondary_damage" text,
	"title_class" text,
	"doc_type" text,
	"has_keys" boolean,
	"sold_at" timestamp with time zone,
	"lot_snapshot" jsonb,
	"container_number" text,
	"bill_of_lading" text,
	"vessel_name" text,
	"departure_port" text,
	"destination_port" text,
	"eta_at" timestamp with time zone,
	"usd_to_eur_micros" integer,
	"rate_set_at" timestamp with time zone,
	"stage" text DEFAULT 'won' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"internal_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_cost_lines" ADD CONSTRAINT "order_cost_lines_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_lines" ADD CONSTRAINT "order_cost_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stage_events" ADD CONSTRAINT "order_stage_events_order_id_vehicle_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vehicle_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stage_events" ADD CONSTRAINT "order_stage_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD CONSTRAINT "vehicle_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD CONSTRAINT "vehicle_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_cost_lines_order_idx" ON "order_cost_lines" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "order_files_storage_key_idx" ON "order_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "order_files_order_stage_idx" ON "order_files" USING btree ("order_id","stage","sort_order");--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_stage_events_order_stage_idx" ON "order_stage_events" USING btree ("order_id","stage");--> statement-breakpoint
CREATE INDEX "order_stage_events_order_idx" ON "order_stage_events" USING btree ("order_id","happened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_orders_reference_idx" ON "vehicle_orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "vehicle_orders_user_idx" ON "vehicle_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "vehicle_orders_stage_idx" ON "vehicle_orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "vehicle_orders_platform_lot_idx" ON "vehicle_orders" USING btree ("platform","lot_number");