/**
 * Pre-launch gate — keeps the site invisible to the public before launch.
 *
 * Why this exists rather than a Vercel setting: on the Pro plan, Vercel's
 * Deployment Protection only covers preview and *generated* deployment URLs.
 * Production domains — both `smartautobid.vercel.app` and the custom
 * `smartautobid.com` — stay publicly readable unless you buy the Advanced
 * Deployment Protection add-on ($150/month, 30-day minimum). Verified
 * empirically on 2026-08-04: with Vercel Authentication + Standard Protection
 * switched on, the generated URL returned 302 to a login page while
 * `smartautobid.vercel.app` still served the full homepage with HTTP 200.
 *
 * DELETING THIS AT LAUNCH: unset `SITE_GATE_PASSWORD` in Vercel. The gate
 * disables itself when the variable is absent, so going live needs no code
 * change and no redeploy of edited files — the same convention the analytics
 * and reCAPTCHA integrations already follow. Once the site is public for good,
 * this file and its two call sites in `proxy.ts` can be deleted outright.
 *
 * THREAT MODEL — deliberately modest. This stops search engines, competitors
 * and idle visitors from reading an unfinished site. It is NOT an
 * authentication system: one shared password, and anyone holding it (or the
 * cookie it sets) gets in. That is proportionate because everything behind it
 * is public marketing copy. Do not extend this into Phase 2's real login —
 * that needs per-user identity, revocable sessions and a database.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/** Matches the `smartautobid-` prefix already used for the consent key. */
const COOKIE_NAME = "smartautobid-gate";

/** `?key=<password>` unlocks, then is stripped from the URL immediately. */
const UNLOCK_PARAM = "key";

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The cookie stores a hash, never the password itself — otherwise the raw
 * password would sit in the browser's dev tools, visible in any screen share
 * or screenshot of the site being demoed.
 */
function tokenFor(password: string): string {
  return createHash("sha256").update(`smartautobid-gate:${password}`).digest("hex");
}

/** Constant-time compare so a wrong guess can't be narrowed down by timing. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so this guard is required —
  // it leaks only the length, which is a fixed 64-char hash either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 503 rather than 404 or 401: it tells crawlers "temporarily unavailable, come
 * back later" instead of "this page does not exist", so the eventual launch
 * starts from a clean slate rather than having to undo a de-indexing. The
 * `X-Robots-Tag` header is belt-and-braces for crawlers that would otherwise
 * index the holding page's own text.
 */
function holdingPage(): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>SmartAutoBid</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #fbfaf9; color: #1a1817;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center; padding: 24px;
  }
  main { max-width: 30rem; }
  h1 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
  .brand { color: #c36624; }
  p { color: #504b48; line-height: 1.6; margin: 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #15130f; color: #f2efec; }
    p { color: #b8b2ad; }
  }
</style>
</head>
<body>
  <main>
    <h1>Smart<span class="brand">AutoBid</span></h1>
    <p>Our new site is on its way. Please check back soon.</p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
    },
  });
}

/**
 * Returns a response to send INSTEAD of the real page, or `null` to let the
 * request continue. Null is the "gate is open" signal — either because it is
 * switched off entirely, or because this visitor has unlocked it.
 */
export function preLaunchGate(request: NextRequest): NextResponse | null {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) return null; // Unset = launched. See the note at the top.

  const expected = tokenFor(password);

  // 1. Unlocking via ?key=... — redirect to strip the password back out of the
  //    address bar, so it doesn't leak through browser history, the Referer
  //    header, or a screenshot of the URL.
  const supplied = request.nextUrl.searchParams.get(UNLOCK_PARAM);
  if (supplied && matches(tokenFor(supplied), expected)) {
    const clean = new URL(request.url);
    clean.searchParams.delete(UNLOCK_PARAM);
    const response = NextResponse.redirect(clean);
    response.cookies.set(COOKIE_NAME, expected, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  }

  // 2. Already unlocked.
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie && matches(cookie, expected)) return null;

  // 3. Locked. API routes get JSON — returning an HTML holding page to a fetch
  //    call would surface as a confusing JSON parse error rather than a 503.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503, headers: { "x-robots-tag": "noindex, nofollow" } }
    );
  }

  return holdingPage();
}
