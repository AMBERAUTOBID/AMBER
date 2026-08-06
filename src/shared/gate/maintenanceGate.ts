/**
 * Maintenance mode — the read side, run by the proxy on every request.
 *
 * The write side (the admin's toggle) lives in `modules/admin/model/
 * maintenance.ts`; this file may not import from modules/ and doesn't need
 * to — it only reads the `site_settings` row and serves the closed sign.
 *
 * Three design decisions worth knowing before touching this:
 *
 * 1. **The flag is cached in module scope for a few seconds.** A DB query
 *    per request in the proxy would tax every page view for a switch that
 *    flips a few times a year. A proxy instance re-reads at most once per
 *    TTL, so the toggle takes effect site-wide within seconds — the admin's
 *    own browser sees it immediately anyway, via the bypass cookie set by
 *    the toggle response.
 *
 * 2. **DB failure fails OPEN.** If the settings row can't be read, the site
 *    stays up. Maintenance mode is an operator convenience; a database
 *    hiccup must not escalate into a full outage because a gate erred on
 *    the side of closed. (The pre-launch gate makes the opposite choice —
 *    it fails closed by construction — because hiding an unlaunched site is
 *    the point. Different stakes, different defaults.)
 *
 * 3. **The 503 page is raw HTML built here, not a Next route.** Maintenance
 *    mode exists for exactly the moments the app itself may be mid-change —
 *    a rewrite into the app would depend on the very code being changed. A
 *    self-contained response with inline styles cannot be broken by the
 *    deploy it is covering for. It also lets us send a real 503 with
 *    Retry-After, which App Router pages cannot; crawlers read 503 as
 *    "temporary, come back later" and never cache the closed sign as
 *    content.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { SITE, CONTACT_HREF } from "@/shared/config/site";

/** Same naming family as the session and gate cookies. */
export const MAINTENANCE_BYPASS_COOKIE = "smartautobid-maintenance-bypass";

/** How stale the cached flag may be. Flipping the switch takes effect
 * everywhere within this window. */
const CACHE_TTL_MS = 10_000;

interface SettingsSnapshot {
  maintenance: boolean;
  bypassTokenHash: string | null;
}

let cache: { value: SettingsSnapshot; fetchedAt: number } | null = null;

async function readSettings(): Promise<SettingsSnapshot> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.value;
  try {
    const rows = await db()
      .select({
        maintenance: schema.siteSettings.maintenance,
        bypassTokenHash: schema.siteSettings.bypassTokenHash,
      })
      .from(schema.siteSettings)
      .where(eq(schema.siteSettings.id, 1))
      .limit(1);
    const value = rows[0] ?? { maintenance: false, bypassTokenHash: null };
    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch (e) {
    // Fail open — see decision 2. Cached too, so a struggling database is
    // asked once per TTL, not hammered once per request.
    console.error("[maintenance] settings read failed, treating as off:", e);
    const value = { maintenance: false, bypassTokenHash: null };
    cache = { value, fetchedAt: Date.now() };
    return value;
  }
}

/**
 * Paths that stay reachable while the site is closed:
 *
 * - `/api/auth/*` — so an admin can sign in from a second device; a
 *   successful ADMIN login hands out the bypass cookie (see the login
 *   route). Clients can technically still log in but only reach the closed
 *   sign.
 * - `/api/admin/*` — the console's own actions, most importantly the one
 *   that turns maintenance OFF. Every route there authenticates itself via
 *   currentAdmin(); the gate adds nothing to what they already check.
 * - robots.txt / sitemap.xml — a 503 on robots.txt tells crawlers to stop
 *   crawling the site entirely, which a short maintenance window doesn't
 *   want.
 *
 * Everything else — pages AND the client-facing APIs — gets the 503. APIs
 * are included deliberately: a client mid-session could otherwise keep
 * submitting plan requests into a database the owner is in the middle of
 * changing, which is precisely the scenario maintenance mode exists for.
 */
function isExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

/**
 * Returns the closed-sign response, or null to let the request through.
 * Called from proxy.ts before locale routing.
 */
export async function maintenanceGate(request: NextRequest): Promise<NextResponse | null> {
  const settings = await readSettings();
  if (!settings.maintenance) return null;

  const { pathname } = request.nextUrl;
  if (isExemptPath(pathname)) return null;

  // The bypass cookie: hash-compared against the settings row — the browser
  // holds the token, the database only its SHA-256, same rule as sessions.
  const token = request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value;
  if (token && settings.bypassTokenHash) {
    const hash = createHash("sha256").update(token).digest("hex");
    if (hash === settings.bypassTokenHash) return null;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "maintenance" },
      { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } }
    );
  }

  return new NextResponse(maintenanceHtml(localeFromPath(pathname)), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 5 minutes: honest for "a couple of changes", short enough that
      // crawlers and impatient visitors come back promptly.
      "Retry-After": "300",
      "Cache-Control": "no-store",
    },
  });
}

function localeFromPath(pathname: string): "en" | "ru" | "lt" {
  if (pathname === "/ru" || pathname.startsWith("/ru/")) return "ru";
  if (pathname === "/lt" || pathname.startsWith("/lt/")) return "lt";
  return "en";
}

/**
 * The three translations live here rather than in messages/*.json — a
 * deliberate exception to invariant #2, because this page renders from the
 * proxy where next-intl doesn't exist, and importing three 600-key message
 * files into the proxy bundle for one sentence each would be absurd. Parity
 * holds by construction: one object, all three locales side by side.
 */
const COPY = {
  en: {
    title: "We'll be back shortly",
    body: "We're making a few improvements to the site. It won't take long — please check back in a few minutes.",
    contact: "Need us right now?",
  },
  ru: {
    title: "Скоро вернёмся",
    body: "Мы вносим небольшие улучшения на сайт. Это ненадолго — загляните снова через несколько минут.",
    contact: "Нужно связаться прямо сейчас?",
  },
  lt: {
    title: "Netrukus grįšime",
    body: "Šiuo metu tobuliname svetainę. Tai truks neilgai — užsukite po kelių minučių.",
    contact: "Reikia mūsų dabar?",
  },
} as const;

function maintenanceHtml(locale: "en" | "ru" | "lt"): string {
  const t = COPY[locale];
  // Inline everything: this page must survive the app being half-deployed,
  // so it depends on nothing but this string and the public logo asset —
  // which bypasses the proxy and is served statically regardless (and hides
  // itself via onerror if even that is missing).
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title} — ${SITE.name}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    background:#faf9f7;color:#1c1917;padding:24px}
  .card{max-width:26rem;text-align:center}
  .logo{height:72px;width:72px;object-fit:contain;margin:0 auto 4px}
  .brand{font-weight:800;font-size:1.35rem;letter-spacing:-0.02em}
  .brand b{color:#f59e0b}
  h1{font-size:1.65rem;font-weight:800;letter-spacing:-0.02em;margin:28px 0 0}
  p{color:#57534e;line-height:1.65;margin:14px 0 0;font-size:.95rem}
  .divider{height:1px;background:#e7e5e4;margin:28px auto;max-width:16rem}
  .contact{font-size:.85rem;color:#78716c}
  .links{margin-top:10px;display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
  .links a{color:#b45309;font-weight:600;font-size:.9rem;text-decoration:none}
  .links a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="/images/logo-mark-transparent.png" alt="" onerror="this.style.display='none'">
  <div class="brand">Smart<b>AutoBid</b></div>
  <h1>${t.title}</h1>
  <p>${t.body}</p>
  <div class="divider"></div>
  <p class="contact">${t.contact}</p>
  <div class="links">
    <a href="${CONTACT_HREF.whatsapp}">WhatsApp</a>
    <a href="${CONTACT_HREF.email}">${SITE.email}</a>
    <a href="${CONTACT_HREF.tel}">${SITE.phone.display}</a>
  </div>
</div>
</body>
</html>`;
}
