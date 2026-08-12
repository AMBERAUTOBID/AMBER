import { NextResponse } from "next/server";
import { fetchLotSnapshot } from "@/modules/favorites/api/fetchSnapshot";
import { favoriteLookup, refreshFavorite } from "@/modules/favorites/model/favorites";
import { requireSaver, UUID } from "@/modules/favorites/api/guard";
import { consumeLimit } from "@/modules/auth/model/rateLimit";

/**
 * Pull current price and sale date for one saved car.
 *
 * This is the only place a client can spend Apibara quota on demand, so it is
 * rate limited per user. The quota is shared with the Telegram bot, which
 * posts on a schedule and cannot back off — someone leaning on a refresh
 * button should not be able to starve it.
 *
 * Requires a plan, unlike listing and removing: reading a stored snapshot
 * costs nothing, asking the auction site again does.
 */
export async function POST(request: Request) {
  const { user, error } = await requireSaver();
  if (error) return error;

  if (!(await consumeLimit("favoriteRefreshPerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Read the identity from OUR row rather than trusting a lot reference in
  // the request. Otherwise this endpoint would happily overwrite one saved
  // car's snapshot with a different car's data.
  const row = await favoriteLookup(id, user.id);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Lot number first, VIN only as a fallback. Asking upstream by VIN returns
  // whichever appearance of that car it prefers, so a favourite saved from an
  // upcoming lot could be refreshed with a long-finished sale's price — the
  // stored row would then disagree with the lot page it links to.
  const snapshot = await fetchLotSnapshot(row.lotNumber);
  if (!snapshot) {
    // Unreachable upstream, or the lot has gone. 502 rather than 404: the
    // favourite exists, we just couldn't refresh it. The stored snapshot is
    // left exactly as it was — a failed refresh must never blank a card the
    // client can still read.
    return NextResponse.json({ ok: false, error: "lot_unavailable" }, { status: 502 });
  }

  const result = await refreshFavorite(id, user.id, snapshot);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
