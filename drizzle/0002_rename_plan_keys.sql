-- Plan keys renamed from the tier1/tier2/tier3 placeholders to the real
-- names the owner chose: bronze, silver, gold, platinum.
--
-- Hand-written rather than generated because drizzle-kit diffs schema shape,
-- and this is a data migration: the columns are unchanged, the values in them
-- are not. Only tier1 was ever taken (one pending request on the admin
-- account); tier2/tier3 never reached a row, but both are mapped anyway so
-- this is safe to run against any database that saw the old catalogue.
--
-- tier1 -> bronze  (the free tier, unchanged in meaning)
-- tier2 -> silver  (nearest equivalent; the paid tiers were re-specified)
-- tier3 -> gold

UPDATE deposits SET plan_key = 'bronze' WHERE plan_key = 'tier1';
--> statement-breakpoint
UPDATE deposits SET plan_key = 'silver' WHERE plan_key = 'tier2';
--> statement-breakpoint
UPDATE deposits SET plan_key = 'gold' WHERE plan_key = 'tier3';
--> statement-breakpoint
UPDATE users SET active_plan_key = 'bronze' WHERE active_plan_key = 'tier1';
--> statement-breakpoint
UPDATE users SET active_plan_key = 'silver' WHERE active_plan_key = 'tier2';
--> statement-breakpoint
UPDATE users SET active_plan_key = 'gold' WHERE active_plan_key = 'tier3';
