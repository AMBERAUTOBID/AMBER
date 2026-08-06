import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { preLaunchGate } from "./shared/gate/preLaunchGate";
import { maintenanceGate } from "./shared/gate/maintenanceGate";

const intlProxy = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // The gate runs first so a locked-out visitor never reaches locale routing.
  const locked = preLaunchGate(request);
  if (locked) return locked;

  // Maintenance second: pre-launch privacy outranks the closed sign while
  // both exist, and when the gate is deleted at launch this becomes the
  // first check. DB-backed flag behind a short in-memory cache; fails open.
  const closed = await maintenanceGate(request);
  if (closed) return closed;

  // These carry no locale prefix, so next-intl must not touch them. They are
  // inside the matcher below only so the gate can cover them; without this
  // guard next-intl would rewrite /robots.txt to /en/robots.txt — which would
  // break SEO at launch, when the gate is off and these must serve normally.
  if (isNonLocalized(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return intlProxy(request);
}

function isNonLocalized(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

export const config = {
  // The first pattern excludes anything containing a dot, which is how static
  // assets stay out of the proxy. robots.txt and sitemap.xml are added back
  // explicitly: both contain dots, so they were reachable while the rest of
  // the site was gated — robots.txt announcing "Allow: /" and the sitemap
  // listing every URL. A 5xx on robots.txt tells crawlers to stop crawling
  // the site entirely, which is precisely what a pre-launch site wants.
  //
  // `api` is deliberately NOT excluded either: it was until the gate landed,
  // which would have left /api/contact publicly callable behind a hidden site.
  //
  // Still public by choice: /public assets (the logo, images). They are
  // already on the Telegram channel and social profiles, so gating them buys
  // nothing and would put the proxy in front of every image request.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/robots.txt", "/sitemap.xml"],
};
