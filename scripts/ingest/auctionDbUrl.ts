/**
 * Which database the ingest tooling talks to — resolved in ONE place.
 *
 * There were five copies of this two-line lookup (sweep, health, notify,
 * preflight, profile). Renaming the variable in one of them and not the others
 * is a silent failure with the worst possible shape: the sweep writes to the
 * new branch while the health check reads the old one and reports "healthy"
 * about a database nobody is filling any more.
 *
 * NAME ORDER. `DATABASE_URL_AUCTION*` is the current name and matches what the
 * app reads through `auctionDb()`. `DATABASE_URL_MIRROR*` is the older name,
 * still honoured so an environment that has not been renamed keeps working —
 * GitHub Actions secrets, for one, are changed by hand.
 *
 * POOLED VS UNPOOLED IS NOT COSMETIC. Bulk writes and DDL go to the direct
 * endpoint; the pooler is a transaction pooler and misbehaves with both. Read-
 * only tools may use either, and ask for pooled.
 *
 * NEVER `DATABASE_URL`. That is production. Refusing to fall back to it is why
 * a missing variable stops the run instead of quietly ingesting 140,000 rows
 * into the customer database.
 */
export function auctionDbUrl(opts: { unpooled: boolean }): string | undefined {
  return opts.unpooled
    ? (process.env.DATABASE_URL_AUCTION_UNPOOLED ??
        process.env.DATABASE_URL_MIRROR_UNPOOLED ??
        process.env.DATABASE_URL_AUCTION ??
        process.env.DATABASE_URL_MIRROR)
    : (process.env.DATABASE_URL_AUCTION ??
        process.env.DATABASE_URL_MIRROR ??
        process.env.DATABASE_URL_AUCTION_UNPOOLED ??
        process.env.DATABASE_URL_MIRROR_UNPOOLED);
}

/** The message every caller printed by hand, so they cannot disagree. */
export const AUCTION_DB_URL_MISSING =
  "Neither DATABASE_URL_AUCTION_UNPOOLED nor DATABASE_URL_MIRROR_UNPOOLED is set. Refusing to fall back to DATABASE_URL.";
