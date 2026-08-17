import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { isBidDepositStatus, setDepositStatus } from "@/modules/bids/model/bidRequests";

/**
 * Record that a security deposit arrived, went back, or was kept.
 *
 * **Separate from `/api/admin/bids/deposit`, which changes the AMOUNT.** That
 * one can quietly reduce what we hold against a client who might walk away
 * from a car, so it asks for a password. This one moves money that has already
 * been agreed, in a direction the client can see on their own page — and it is
 * the only thing that moves the rolling balance, so the legality of each move
 * is decided in `setDepositStatus`, not here.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  // 404, not 403 — a non-admin learns nothing about what lives here.
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const to = body?.status;

  if (!UUID.test(requestId) || !isBidDepositStatus(to)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await setDepositStatus(requestId, to, admin.id);

  if (result.status === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.status === "not_allowed") {
    // 409: nothing was malformed, the hold is simply not where the caller
    // thought. Usually somebody else recorded it a moment ago.
    return NextResponse.json(
      { ok: false, error: "not_allowed", from: result.from },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: result.to });
}
