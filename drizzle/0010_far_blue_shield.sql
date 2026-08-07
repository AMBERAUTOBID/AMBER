DROP INDEX "auction_sales_platform_lot_idx";--> statement-breakpoint
ALTER TABLE "auction_sales_history" ADD COLUMN "vendor_entry_id" bigint NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_sales_vendor_entry_idx" ON "auction_sales_history" USING btree ("vendor_entry_id");--> statement-breakpoint
CREATE INDEX "auction_sales_platform_lot_idx" ON "auction_sales_history" USING btree ("platform","lot_number");