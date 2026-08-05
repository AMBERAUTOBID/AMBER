import { redirect } from "@/i18n/navigation";
import { currentUser } from "@/modules/auth/model/currentUser";
import type { SessionUser } from "@/modules/auth/model/session";

/**
 * The account area's gate. **Every page under `(app)` calls this itself** —
 * the layout calling it is not enough and must never be treated as the
 * boundary.
 *
 * Two reasons, and the first is the important one:
 *
 * 1. A layout is not a security boundary in Next.js. Layouts are shared and
 *    can be skipped on client-side navigations between sibling routes, so a
 *    check that lives only in a layout is a check that sometimes doesn't
 *    run. This mirrors the rule already established for `proxy.ts`
 *    (ARCHITECTURE.md §7): middleware and layouts are chrome, the page's own
 *    `currentUser()` call is the check.
 * 2. It reads clearly at the top of each page which pages need a session.
 *
 * The repeated lookup this implies costs nothing: `currentUser` is
 * request-deduplicated, so the layout and the page share one query.
 */
export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) {
    redirect({ href: "/login", locale });
    // Unreachable: redirect() throws. next-intl types it as returning void
    // rather than never, so TypeScript still needs this to narrow `user`.
    throw new Error("unreachable");
  }
  return user;
}
