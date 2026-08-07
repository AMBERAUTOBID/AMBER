ALTER TABLE "auction_lots" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple',
        coalesce("make", '') || ' ' ||
        coalesce("model", '') || ' ' ||
        coalesce("series", '') || ' ' ||
        coalesce("year"::text, '') || ' ' ||
        coalesce("body_style", '') || ' ' ||
        coalesce("color", '') || ' ' ||
        coalesce("vin", '') || ' ' ||
        coalesce("lot_number", '') || ' ' ||
        regexp_replace(coalesce("model", ''), '[^a-zA-Z0-9]', '', 'g') || ' ' ||
        regexp_replace(coalesce("series", ''), '[^a-zA-Z0-9]', '', 'g')
      )) STORED;--> statement-breakpoint
CREATE INDEX "auction_lots_search_tsv_idx" ON "auction_lots" USING gin ("search_tsv");