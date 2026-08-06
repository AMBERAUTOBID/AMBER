import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { deleteAccount } from "@/modules/auth/model/deleteAccount";
import { verifyPassword } from "@/modules/auth/model/password";
import { consumeLimit } from "@/modules/auth/model/rateLimit";
import { clearSessionCookie } from "@/modules/auth/api/http";
import { db, schema } from "@/shared/db/client";
import { eq } from "drizzle-orm";

/**
 * A client erases their own account.
 *
 * The password is required and that is not ceremony: this is the single most
 * destructive thing anyone can do here, it cannot be undone, and a session
 * left open on a shared machine must not be enough to do it. Same reasoning
 * as the change-password endpoint, with worse consequences.
 *
 * Rate limited for the same reason too — verifying a password makes an
 * endpoint an oracle for guessing it.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  if (!(await consumeLimit("passwordChangePerUser", user.id))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const rows = await db()
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);

  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(password, stored))) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 403 });
  }

  const result = await deleteAccount(user.id, user.id);
  if (result === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 409 });
  }

  // Every session was just destroyed server-side, so the cookie now points at
  // nothing. Clearing it as well means the browser stops sending a token that
  // can never work again, instead of carrying it around for thirty days.
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
