ALTER TABLE "vehicle_orders" ADD COLUMN "title_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_name" text;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_company" text;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_phone" text;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_email" text;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_address" text;--> statement-breakpoint
ALTER TABLE "vehicle_orders" ADD COLUMN "consignee_country" text;