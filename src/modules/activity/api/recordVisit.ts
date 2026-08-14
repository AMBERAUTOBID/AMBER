import "server-only";
import { headers } from "next/headers";
import { recordActivity, type ActivityInput } from "../model/events";

/**
 * Record a page visit — but only if a person actually visited.
 *
 * ── WHAT WAS MEASURED, 2026-08-14 ───────────────────────────────────────
 * The worry this file exists for: Next prefetches `<Link>` targets on hover
 * and on viewport entry. If those executed the page, an admin would see a
 * client "viewing" every lot whose card scrolled past — dozens of cars they
 * never opened, mixed indistinguishably with the handful they did. A history
 * that reports things which did not happen makes the ones that did
 * unbelievable, so this is worse than having no history.
 *
 * Driven in a real browser against the production build, signed in:
 *
 *   - hovering 8 real result cards, plus a full page of cards entering the
 *     viewport → **0 rows written**. Next's default partial prefetch stops at
 *     the layout/loading boundary and never runs the page component.
 *   - clicking one of them → **1 row**, with the server-resolved label
 *     ("2019 AUDI Q7 55 PREMIUM"). Client-side navigations do count, which is
 *     what we want — that is a person opening a car.
 *
 * ⚠️ **An earlier version of this file checked `Next-Router-Prefetch: 1` and
 * that check was DEAD CODE.** The header is listed in Next's own
 * `FLIGHT_HEADERS` (`next/dist/client/components/app-router-headers`) and
 * `stripFlightHeaders` deletes every one of them before the app sees the
 * request — so `headers().get(...)` could never return it. Measured directly:
 * a request carrying that header was recorded anyway. It is removed rather
 * than left in place, because dead code that *looks* like the protection is
 * worse than no protection: the next person reads it, believes prefetch is
 * handled, and never checks. `prefetchHeaders.test.ts` is the tripwire that
 * fails if Next ever changes which headers it strips.
 *
 * So prefetch safety rests on Next not running the page for a partial
 * prefetch, not on anything here. If phantom views ever appear in the
 * histories, that is the assumption that broke — start there.
 * ────────────────────────────────────────────────────────────────────────
 *
 * What this DOES still catch is the other kind of prefetch: `Purpose:
 * prefetch` / `X-Purpose: prefetch`, sent by browsers and proxies fetching a
 * page speculatively. Those are ordinary request headers, they are not
 * stripped, and they were measured reaching the app — a request carrying one
 * renders fully and is correctly skipped here.
 */
export async function recordVisit(input: ActivityInput): Promise<void> {
  const h = await headers();
  if (h.get("purpose") === "prefetch" || h.get("x-purpose") === "prefetch") return;
  await recordActivity(input);
}
