import { NextResponse } from "next/server";
import { fetchLotSnapshot } from "@/modules/favorites/api/fetchSnapshot";
import { saveFavorite, removeFavorite } from "@/modules/favorites/model/favorites";
import { requireOwner, requireSaver, UUID } from "@/modules/favorites/api/guard";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { recordActivity } from "@/modules/activity/model/events";
import { lotLabel, lotSubjectKey } from "@/modules/activity/model/subjects";

/**
 * Save a car.
 *
 * The request says only WHICH lot. The snapshot is built from our own fetch
 * of it — if the client supplied the title and price, anyone could save
 * "Ferrari — $1", and that row would then be indistinguishable from a real
 * one on the favourites page. Same rule as deposits.amountCents: the value
 * comes from our source, never from the caller.
 *
 * One upstream call per save is an acceptable cost: it happens on a
 * deliberate click, not on every page view, which is the whole reason the
 * snapshot exists.
 */
export async function POST(request: Request) {
  const { user, error } = await requireSaver();
  if (error) return error;

  // Each save is one Apibara call — metered like refresh, and for the same
  // reason (2026-08-06 audit: this was the one unmetered quota spender).
  if (!(await consumeLimit("favoriteSavePerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { lot?: unknown } | null;
  const lotRef = typeof body?.lot === "string" ? body.lot.trim() : "";
  // Loose but bounded: this is a VIN or a lot number, both of which vary in
  // shape across the two platforms. It reaches the upstream URL path, so it
  // is length-capped and stripped of anything that isn't plausibly an
  // identifier.
  if (!lotRef || lotRef.length > 64 || /[^A-Za-z0-9-]/.test(lotRef)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const snapshot = await fetchLotSnapshot(lotRef);
  if (!snapshot) {
    // Covers "no such lot" and "upstream is unhappy" with one answer, so this
    // endpoint can't be used to probe which lot numbers are real.
    return NextResponse.json({ ok: false, error: "lot_unavailable" }, { status: 404 });
  }

  const result = await saveFavorite(user.id, snapshot);
  // Only on a genuinely new save. `already_saved` is a double-clicked button,
  // and logging it would turn one decision into two lines of history.
  if (result === "saved") {
    await recordActivity({
      userId: user.id,
      kind: "lot.saved",
      subjectKey: lotSubjectKey(snapshot.platform, snapshot.lotNumber),
      label: lotLabel(snapshot.title, snapshot.priceUsdCents),
      detail: { vin: snapshot.vin, lot: snapshot.lotNumber, platform: snapshot.platform },
    });
  }
  return NextResponse.json({ ok: true, status: result });
}

/**
 * Remove one.
 *
 * Needs a session only — **not** a plan. A client whose deposit was refunded
 * keeps their collection and must still be able to prune it; making removal
 * require a plan would leave them staring at a list they can neither use nor
 * tidy.
 *
 * Ownership is scoped inside the query, not checked before it — another
 * client's id matches no row rather than being caught by a guard.
 */
export async function DELETE(request: Request) {
  const { user, error } = await requireOwner();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await removeFavorite(id, user.id);
  if (result.status === "not_found") {
    // Covers "already gone" and "not yours" with one answer, so the endpoint
    // can't be used to test whether an id exists.
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Worth recording as much as the save: a car that goes on the list and comes
  // off it a day later is a decision, and a history showing only the saves
  // would describe a client still interested in forty cars they have since
  // ruled out.
  await recordActivity({
    userId: user.id,
    kind: "lot.unsaved",
    subjectKey: lotSubjectKey(result.platform, result.lotNumber),
    label: lotLabel(result.title, result.priceUsdCents),
    detail: { lot: result.lotNumber, platform: result.platform },
  });
  return NextResponse.json({ ok: true });
}
