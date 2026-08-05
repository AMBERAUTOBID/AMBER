import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/modules/auth/model/currentUser";
import { SESSION_COOKIE, destroyOtherSessionsForUser } from "@/modules/auth/model/session";

/**
 * "Sign out on all other devices."
 *
 * Keeps the caller signed in on purpose — someone using this because they
 * don't recognise a device should not be logged out of the browser they're
 * fixing it from. Scoped to the session's own user id, so there is no way to
 * revoke anybody else's sessions.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // currentUser() resolved, so a cookie exists; this is belt and braces
  // against a future refactor that changes how the session is carried. Were
  // it ever missing, deleting "every session but none of them" would sign the
  // client out of the browser they're standing in.
  if (!token) return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });

  const revoked = await destroyOtherSessionsForUser(user.id, token);
  return NextResponse.json({ ok: true, revoked });
}
