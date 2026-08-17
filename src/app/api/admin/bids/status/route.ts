import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { setBidStatus } from "@/modules/bids/model/bidRequests";
import { isBidRequestStatus } from "@/modules/bids/model/bidStatus";

/** A refusal the client reads. Long enough to explain, short enough to store. */
const MAX_REASON = 500;

/**
 * Answer or advance one bid instruction.
 *
 * **No password here, unlike the deposit override next door, and the
 * difference is deliberate.** That endpoint can quietly reduce what we hold
 * against a client who might walk away from a car — a loss nobody notices
 * until it happens. These moves are all visible to the person they affect: a
 * client who is declined is told, and one whose bid we claim to have placed
 * will ask about the auction. Guarding both would train whoever works this
 * queue all day to type their password without reading, which is the failure
 * the password exists to prevent.
 *
 * Everything that decides whether a move is legal lives in `setBidStatus` and
 * `bidStatus.ts`. This route validates shapes and nothing else.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  // 404, not 403 — a non-admin learns nothing about what lives here.
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const to = body?.status;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, MAX_REASON) : null;

  if (!UUID.test(requestId) || !isBidRequestStatus(to)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await setBidStatus({ requestId, to, adminId: admin.id, reason });

  if (result.status === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.status === "needs_reason") {
    return NextResponse.json({ ok: false, error: "needs_reason" }, { status: 400 });
  }
  if (result.status === "not_allowed") {
    // 409, because nothing about the request was malformed — the instruction
    // simply is not where the caller thought it was. Usually somebody else
    // answered it a moment ago, and the page needs re-reading rather than the
    // click needs repeating.
    return NextResponse.json(
      { ok: false, error: "not_allowed", from: result.from },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: result.to });
}
