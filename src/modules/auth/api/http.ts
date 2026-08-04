/**
 * Shared HTTP plumbing for the auth routes: request-context extraction and
 * the session cookie's one true shape. Routes stay thin; anything two of
 * them would repeat lives here.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../model/session";

/** First hop of x-forwarded-for — what Vercel reports as the client. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function clientContext(request: Request): { ip: string; userAgent?: string } {
  return { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? undefined };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * The absolute URL for links we email out. Origin comes from the request so
 * local dev links point at localhost, not production.
 *
 * While the pre-launch gate is active (SITE_GATE_PASSWORD set), the unlock
 * key is appended. Without it an emailed verification link opens the "coming
 * soon" holding page instead of verifying — the recipient is, by definition,
 * arriving in a fresh browser with no unlock cookie, which is precisely the
 * case the gate is built to block. Verified: the gate consumes `key`,
 * redirects to the same URL without it, and the `token` param survives.
 *
 * This self-disables at launch along with the rest of the gate — once
 * SITE_GATE_PASSWORD is unset, emailed links are clean again with no code
 * change.
 */
export function absoluteUrl(request: Request, localePath: string): string {
  const url = new URL(localePath, new URL(request.url).origin);
  const gatePassword = process.env.SITE_GATE_PASSWORD;
  if (gatePassword) url.searchParams.set("key", gatePassword);
  return url.toString();
}
