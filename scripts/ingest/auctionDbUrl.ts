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
/**
 * Empty is not "set". GitHub Actions substitutes an UNSET secret as an empty
 * string, so `??` would accept `""` and hand it on as a connection string —
 * the workflow passes both the new and the old name, and whichever secret has
 * not been created yet arrives empty. `??` only skips null and undefined, so
 * the fallback chain would stop at the empty one and the sweep would try to
 * connect to nothing. Trimmed, because a stray newline pasted into a secret
 * is the other way this arrives looking set.
 */
function firstSet(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function auctionDbUrl(opts: { unpooled: boolean }): string | undefined {
  const {
    DATABASE_URL_AUCTION_UNPOOLED: auctionDirect,
    DATABASE_URL_MIRROR_UNPOOLED: mirrorDirect,
    DATABASE_URL_AUCTION: auctionPooled,
    DATABASE_URL_MIRROR: mirrorPooled,
  } = process.env;

  return opts.unpooled
    ? firstSet(auctionDirect, mirrorDirect, auctionPooled, mirrorPooled)
    : firstSet(auctionPooled, mirrorPooled, auctionDirect, mirrorDirect);
}

/** The message every caller printed by hand, so they cannot disagree. */
export const AUCTION_DB_URL_MISSING =
  "Neither DATABASE_URL_AUCTION_UNPOOLED nor DATABASE_URL_MIRROR_UNPOOLED is set. Refusing to fall back to DATABASE_URL.";
