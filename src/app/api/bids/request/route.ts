import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { fetchLotSnapshot } from "@/modules/favorites/api/fetchSnapshot";
import { createBidRequest } from "@/modules/bids/model/bidRequests";
import { isPlanKey } from "@/modules/plans/model/plans";

/** The most anyone may authorise through a form. Above this a person talks to
 * them — see `beyond_tiers` in the deposit rule, which this mirrors so a
 * nonsense figure is refused before it reaches Apibara. */
const MAX_AUTHORISABLE_CENTS = 20_000_000; // $200,000

/**
 * A client authorises us to bid up to a maximum on one lot.
 *
 * **The request says only WHICH lot.** Everything shown to whoever places the
 * bid — the title, the sale time, the platform — comes from our own fetch, the
 * same rule `deposits.amountCents` and the favourites snapshot follow. A
 * caller who could supply the title could put "Ferrari — $500" on an admin
 * screen and have it look exactly like a real instruction.
 *
 * The amount is the one thing the client genuinely decides, so it is taken
 * from them — and then judged by `can()` against their plan rather than
 * trusted.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json({ ok: false, error: "email_not_verified" }, { status: 403 });
  }

  // Each request costs one Apibara call, metered like saving a favourite and
  // for the same reason — that quota is shared with the Telegram bot, which
  // posts on a schedule and cannot back off.
  if (!(await consumeLimit("bidRequestPerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const lotRef = typeof body?.lot === "string" ? body.lot.trim() : "";
  const rawMax = body?.maxBidUsdCents;
  const maxBidUsdCents = typeof rawMax === "number" && Number.isFinite(rawMax) ? Math.round(rawMax) : NaN;

  // Same bounded shape the favourites route accepts: a VIN or a lot number,
  // both of which vary across the two platforms, and both of which reach an
  // upstream URL path.
  if (!lotRef || lotRef.length > 64 || /[^A-Za-z0-9-]/.test(lotRef)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  if (Number.isNaN(maxBidUsdCents) || maxBidUsdCents <= 0 || maxBidUsdCents > MAX_AUTHORISABLE_CENTS) {
    return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
  }
  // Checked before spending an upstream call: an instruction nobody agreed to
  // is not one we can act on, and the tick box is the whole evidence of it.
  if (body?.acceptedTerms !== true) {
    return NextResponse.json({ ok: false, error: "terms_not_accepted" }, { status: 400 });
  }

  const snapshot = await fetchLotSnapshot(lotRef);
  if (!snapshot) {
    // Covers "no such lot" and "upstream is unhappy" with one answer, so this
    // endpoint cannot be used to probe which lot numbers are real.
    return NextResponse.json({ ok: false, error: "lot_unavailable" }, { status: 404 });
  }

  const result = await createBidRequest({
    actor: {
      id: user.id,
      role: user.role,
      emailVerified: user.emailVerified,
      activePlanKey: user.activePlanKey && isPlanKey(user.activePlanKey) ? user.activePlanKey : null,
      selfBiddingGranted: user.selfBiddingGranted,
    },
    lot: {
      platform: snapshot.platform,
      lotNumber: snapshot.lotNumber,
      vin: snapshot.vin,
      title: snapshot.title,
      imageUrl: snapshot.imageUrl,
      auctionAt: snapshot.auctionAt,
    },
    maxBidUsdCents,
    clientNote: typeof body?.note === "string" ? body.note : undefined,
    acceptedTerms: true,
  });

  switch (result.status) {
    case "created":
      return NextResponse.json({
        ok: true,
        id: result.id,
        depositRequiredCents: result.depositRequiredCents,
      });
    case "already_open":
      // Not an error worth alarming anyone with: they pressed twice, or have
      // two tabs. The state they wanted is the state they are in.
      return NextResponse.json({ ok: true, id: result.id, status: "already_open" });
    case "too_late":
      return NextResponse.json({ ok: false, error: "too_late" }, { status: 409 });
    case "needs_quote":
      return NextResponse.json({ ok: false, error: "needs_quote" }, { status: 409 });
    case "denied":
      // can()'s own reason, passed through unchanged so the page can say the
      // true next step — "verify your email" and "that is above your plan"
      // are different problems with different answers.
      return NextResponse.json({ ok: false, error: result.reason }, { status: 403 });
  }
}
