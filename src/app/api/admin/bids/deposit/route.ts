import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { verifyPassword } from "@/modules/auth/model/password";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { setBidDeposit } from "@/modules/bids/model/bidRequests";

/**
 * Change the security deposit on one bid instruction.
 *
 * **The password is asked for in one direction only.** Lowering or waiving a
 * hold increases what we stand to lose if the client wins and walks away;
 * raising one is somebody being careful. Guarding both would teach whoever
 * uses this to type their password without reading the screen, which is the
 * failure the password exists to prevent — so the model decides whether it is
 * needed and this route only checks it when it is.
 *
 * Shaped exactly like `/api/admin/maintenance`, deliberately: the admin's own
 * password against their own row, never a shared secret; 403 for a wrong one,
 * 429 for too many attempts. Verifying a password makes any endpoint an oracle
 * for guessing it, so the rate limit is not optional.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  // 404, not 403 — a non-admin learns nothing about what lives here.
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  if (!(await consumeLimit("bidDepositPerUser", admin.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const raw = body?.depositCents;
  const depositCents = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : NaN;

  if (!UUID.test(requestId) || Number.isNaN(depositCents) || depositCents < 0) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const password = typeof body?.password === "string" ? body.password : "";
  // Verified up front when one was sent, rather than after the model asks for
  // it, so the answer never depends on the order of two round trips. An absent
  // password is simply "not verified" — the model then decides whether that
  // was allowed.
  let passwordVerified = false;
  if (password) {
    const rows = await db()
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, admin.id))
      .limit(1);
    const stored = rows[0]?.passwordHash;
    if (!stored || !(await verifyPassword(password, stored))) {
      return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 403 });
    }
    passwordVerified = true;
  }

  const result = await setBidDeposit(requestId, depositCents, admin.id, passwordVerified);

  if (result.status === "not_found") {
    // Covers "no such request" and "already won, too late to change the hold"
    // as one answer — distinguishing them would let a caller probe for ids.
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (result.status === "needs_password") {
    // Reached when the UI let somebody lower a deposit without asking. The
    // panel computes the same rule client-side, so this is the boundary
    // holding rather than a path a person walks.
    return NextResponse.json({ ok: false, error: "password_required" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, depositCents: result.depositCents });
}
