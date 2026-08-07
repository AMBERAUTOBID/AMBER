-- HAND-EDITED: drizzle-kit generates the indexes but not the extension they
-- need, and `gin_trgm_ops` does not exist until pg_trgm is installed — so
-- without this first statement the two CREATE INDEX calls below fail outright.
-- Idempotent, so re-running the migration set is safe.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "auction_lots_make_trgm_idx" ON "auction_lots" USING gin ("make" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "auction_lots_model_trgm_idx" ON "auction_lots" USING gin ("model" gin_trgm_ops);
