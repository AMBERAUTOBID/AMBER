/**
 * A tripwire on somebody else's code.
 *
 * The activity history's accuracy rests on an assumption about Next that this
 * project does not control: that a `<Link>` prefetch does not execute the page
 * component, so hovering a result card cannot log a car as viewed. That was
 * measured in a real browser (see recordVisit.ts) and it held — 8 hovers, 0
 * rows.
 *
 * What we CAN check cheaply and continuously is the fact that made the
 * original, wrong fix impossible: Next strips its own routing headers before
 * the app sees a request. An earlier version of `recordVisit` tested
 * `Next-Router-Prefetch: 1` and was silently dead code because of it.
 *
 * If a Next upgrade ever removes that header from the strip list, this fails —
 * and that is the moment to reconsider, because a readable header would give
 * us a real check to make instead of an assumption to rely on.
 */
import { describe, expect, it } from "vitest";
import {
  FLIGHT_HEADERS,
  NEXT_ROUTER_PREFETCH_HEADER,
} from "next/dist/client/components/app-router-headers";

describe("Next still hides its prefetch marker from the application", () => {
  it("the header name has not been renamed", () => {
    expect(NEXT_ROUTER_PREFETCH_HEADER).toBe("next-router-prefetch");
  });

  it("it is stripped before the app sees the request", () => {
    // Which is why recordVisit does NOT check it. If this ever fails, the
    // header became readable — go and use it, and delete the assumption.
    expect(FLIGHT_HEADERS).toContain(NEXT_ROUTER_PREFETCH_HEADER);
  });

  it("`purpose` is NOT stripped, which is why that check is real", () => {
    // The browser/proxy prefetch hint. Measured reaching the app, and the one
    // check recordVisit still makes.
    expect(FLIGHT_HEADERS).not.toContain("purpose");
    expect(FLIGHT_HEADERS).not.toContain("x-purpose");
  });
});
