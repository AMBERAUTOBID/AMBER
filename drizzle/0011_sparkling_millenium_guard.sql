ALTER TABLE "auction_lots" ADD COLUMN "primary_damage_class" text;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "secondary_damage_class" text;--> statement-breakpoint
CREATE INDEX "auction_lots_damage_idx" ON "auction_lots" USING btree ("primary_damage_class");