import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/modules/auth/model/session";
import { clearSessionCookie } from "@/modules/auth/api/http";

/** POST, not GET: logout mutates state, and a GET logout can be triggered
 * by any <img src> on any site (classic CSRF-by-prefetch). */
export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await destroySession(token).catch((e) => console.error("[auth] logout:", e));
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
