CREATE TABLE "auction_lot_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"source_url" text NOT NULL,
	"image_key" text
);
--> statement-breakpoint
CREATE TABLE "auction_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"auction_name" text NOT NULL,
	"lot_number" text NOT NULL,
	"vin" text,
	"vendor_lot_id" bigint,
	"vehicle_type" text,
	"body_style" text,
	"car_info_vehicle_type" text,
	"car_info_body_class" text,
	"vehicle_type_id" integer,
	"body_class_id" integer,
	"year" integer,
	"make" text,
	"model" text,
	"series" text,
	"make_id" integer,
	"model_id" integer,
	"series_id" integer,
	"color" text,
	"cylinders" text,
	"engine_type" text,
	"fuel" text,
	"transmission" text,
	"drive" text,
	"odometer" integer,
	"odometer_unit" text,
	"odometer_brand" text,
	"primary_damage" text,
	"secondary_damage" text,
	"doc_type" text,
	"has_keys" boolean,
	"highlights" text,
	"seller_name" text,
	"is_insurance" boolean,
	"location_raw" text,
	"current_bid_cents" integer,
	"buy_now_cents" integer,
	"est_retail_cents" integer,
	"currency_code" text,
	"currency_code_id" integer,
	"sale_date" timestamp with time zone,
	"vendor_created_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_sales_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"lot_number" text NOT NULL,
	"vin" text,
	"year" integer,
	"make" text,
	"model" text,
	"sold_price_cents" integer,
	"currency_code" text,
	"sold_at" timestamp with time zone,
	"sale_status" text,
	"raw" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_lot_images" ADD CONSTRAINT "auction_lot_images_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_lot_images_lot_kind_pos_idx" ON "auction_lot_images" USING btree ("lot_id","kind","position");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_lots_platform_lot_idx" ON "auction_lots" USING btree ("platform","lot_number");--> statement-breakpoint
CREATE INDEX "auction_lots_vin_idx" ON "auction_lots" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "auction_lots_make_model_idx" ON "auction_lots" USING btree ("make","model","year");--> statement-breakpoint
CREATE INDEX "auction_lots_sale_date_idx" ON "auction_lots" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "auction_lots_last_seen_idx" ON "auction_lots" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_sales_platform_lot_idx" ON "auction_sales_history" USING btree ("platform","lot_number","sold_at");--> statement-breakpoint
CREATE INDEX "auction_sales_vin_idx" ON "auction_sales_history" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "auction_sales_make_model_year_idx" ON "auction_sales_history" USING btree ("make","model","year");