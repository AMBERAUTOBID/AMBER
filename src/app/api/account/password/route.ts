import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { changePassword } from "@/modules/auth/model/accounts";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { clientContext, setSessionCookie } from "@/modules/auth/api/http";

/**
 * Change password from inside the account area.
 *
 * Rate limited despite requiring a session: this endpoint verifies the
 * current password, which makes it an oracle for guessing it. Someone who
 * borrows an unlocked laptop should not get unlimited attempts at the
 * password that would let them keep the account.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  // Its own limit, not loginPerEmail: sharing that budget would let failed
  // password-change attempts lock the owner out of logging in, which turns a
  // protection into a denial of service against the person we're protecting.
  if (!(await consumeLimit("passwordChangePerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!current || !next) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await changePassword(user.id, current, next, clientContext(request));
  if (result.status === "invalid_current") {
    return NextResponse.json({ ok: false, error: "invalid_current" }, { status: 403 });
  }
  if (result.status === "weak_password") {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }

  // Every old session was just destroyed, including the one that made this
  // request. Handing back a fresh cookie is what keeps this browser signed
  // in — without it the client is logged out for doing the right thing.
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, result.sessionToken, result.expiresAt);
  return response;
}
