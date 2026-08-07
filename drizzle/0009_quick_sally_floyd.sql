ALTER TABLE "auction_lots" ADD COLUMN "vehicle_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "body_type" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "fuel_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "drive_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "title_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "condition_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "is_enhanced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "engine_cc" integer;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "cylinder_count" integer;--> statement-breakpoint
CREATE INDEX "auction_lots_class_idx" ON "auction_lots" USING btree ("vehicle_class","body_type");--> statement-breakpoint
CREATE INDEX "auction_lots_title_idx" ON "auction_lots" USING btree ("title_class");--> statement-breakpoint
CREATE INDEX "auction_lots_buy_now_idx" ON "auction_lots" USING btree ("buy_now_cents") WHERE "auction_lots"."buy_now_cents" is not null;