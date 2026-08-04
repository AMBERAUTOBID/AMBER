import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { preLaunchGate } from "./shared/gate/preLaunchGate";

const intlProxy = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  // The gate runs first so a locked-out visitor never reaches locale routing.
  const locked = preLaunchGate(request);
  if (locked) return locked;

  // API routes carry no locale prefix, so next-intl must not touch them. They
  // are inside the matcher below only so the gate can cover them; without this
  // guard next-intl would try to redirect /api/contact to /en/api/contact.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return intlProxy(request);
}

export const config = {
  // `api` is deliberately NOT excluded here — it was until the pre-launch gate
  // landed, which would have left /api/contact publicly callable while the
  // rest of the site was hidden. Static assets and Next internals stay out.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
