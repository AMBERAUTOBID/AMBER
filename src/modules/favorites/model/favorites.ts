/**
 * Saved cars: the store, and the four things anyone does with it.
 *
 * Two rules are enforced here rather than in the routes, because a route is
 * not a security boundary:
 *
 * 1. **Ownership is scoped in the SQL WHERE clause, never checked before it.**
 *    Removing and refreshing take an id from the browser; the `userId` in the
 *    query is what makes another client's row match nothing. A read-then-act
 *    check would leave a window between the two.
 * 2. **The snapshot is built from our own fetch of the lot, never from the
 *    request body.** A client that could supply the title and price could
 *    save "Ferrari — $1". Same rule as deposits.amountCents.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import type { FavoriteSnapshot } from "./snapshot";

export interface FavoriteRow {
  id: string;
  platform: string;
  lotNumber: string;
  vin: string | null;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  imageUrl: string | null;
  priceUsdCents: number | null;
  auctionAt: Date | null;
  refreshedAt: Date | null;
  createdAt: Date;
}

const COLUMNS = {
  id: schema.favorites.id,
  platform: schema.favorites.platform,
  lotNumber: schema.favorites.lotNumber,
  vin: schema.favorites.vin,
  title: schema.favorites.title,
  year: schema.favorites.year,
  make: schema.favorites.make,
  model: schema.favorites.model,
  imageUrl: schema.favorites.imageUrl,
  priceUsdCents: schema.favorites.priceUsdCents,
  auctionAt: schema.favorites.auctionAt,
  refreshedAt: schema.favorites.refreshedAt,
  createdAt: schema.favorites.createdAt,
};

/** Newest first. Costs one query and no upstream calls, whatever the size. */
export async function listFavorites(userId: string): Promise<FavoriteRow[]> {
  return db()
    .select(COLUMNS)
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, userId))
    .orderBy(desc(schema.favorites.createdAt));
}

/**
 * Which of this user's saved lots are on a page, as "platform:lotNumber"
 * keys. Lets a search results page mark every card with a single query
 * instead of one per card.
 */
export async function savedLotKeys(userId: string): Promise<Set<string>> {
  const rows = await db()
    .select({ platform: schema.favorites.platform, lotNumber: schema.favorites.lotNumber })
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, userId));
  return new Set(rows.map((r) => lotKey(r.platform, r.lotNumber)));
}

export function lotKey(platform: string, lotNumber: string): string {
  return `${platform}:${lotNumber}`;
}

export type SaveResult = "saved" | "already_saved";

/**
 * Idempotent: saving the same lot twice is a no-op, not an error and not a
 * duplicate row. The unique index does the work, so two rapid clicks race
 * harmlessly instead of needing a check-then-insert.
 */
export async function saveFavorite(
  userId: string,
  snapshot: FavoriteSnapshot
): Promise<SaveResult> {
  const inserted = await db()
    .insert(schema.favorites)
    .values({ userId, ...snapshot })
    .onConflictDoNothing()
    .returning({ id: schema.favorites.id });

  return inserted[0] ? "saved" : "already_saved";
}

export type RemoveResult = "removed" | "not_found";

/** Scoped to the owner in the WHERE clause — see rule 1 in the file header. */
export async function removeFavorite(id: string, userId: string): Promise<RemoveResult> {
  const deleted = await db()
    .delete(schema.favorites)
    .where(and(eq(schema.favorites.id, id), eq(schema.favorites.userId, userId)))
    .returning({ id: schema.favorites.id });
  return deleted[0] ? "removed" : "not_found";
}

/** The identity needed to re-fetch a row from Apibara. */
export async function favoriteLookup(
  id: string,
  userId: string
): Promise<{ vin: string | null; lotNumber: string } | null> {
  const rows = await db()
    .select({ vin: schema.favorites.vin, lotNumber: schema.favorites.lotNumber })
    .from(schema.favorites)
    .where(and(eq(schema.favorites.id, id), eq(schema.favorites.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Overwrites the snapshot with freshly fetched values.
 *
 * Platform and lot number are NOT updated: they are the identity, and the
 * unique index is built on them. Everything else is replaced wholesale,
 * including back to null — a lot whose price is withdrawn should stop showing
 * the old one.
 */
export type RefreshResult = "refreshed" | "not_found";

export async function refreshFavorite(
  id: string,
  userId: string,
  snapshot: FavoriteSnapshot
): Promise<RefreshResult> {
  const updated = await db()
    .update(schema.favorites)
    .set({
      vin: snapshot.vin,
      title: snapshot.title,
      year: snapshot.year,
      make: snapshot.make,
      model: snapshot.model,
      imageUrl: snapshot.imageUrl,
      priceUsdCents: snapshot.priceUsdCents,
      auctionAt: snapshot.auctionAt,
      refreshedAt: new Date(),
    })
    .where(and(eq(schema.favorites.id, id), eq(schema.favorites.userId, userId)))
    .returning({ id: schema.favorites.id });
  return updated[0] ? "refreshed" : "not_found";
}
