/**
 * The timing rule behind the "bid for me" button.
 *
 * Worth testing hard because it is the one piece that decides whether we make
 * a promise we cannot keep. Every case below is a real moment in a Lithuanian
 * client's day against an American auction clock.
 */
import { describe, expect, it } from "vitest";
import {
  acceptsBidRequests,
  bidWindow,
  TOO_LATE_WITHIN_HOURS,
  URGENT_WITHIN_HOURS,
} from "./bidWindow";

const NOW = new Date("2026-08-14T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("the ordinary case", () => {
  it("a sale tomorrow is open", () => {
    expect(bidWindow(inHours(30), NOW)).toEqual({ state: "open", hoursLeft: 30 });
  });

  it("a sale next week is open", () => {
    expect(bidWindow(inHours(24 * 7), NOW).state).toBe("open");
  });
});

describe("tight, but doable — the client must be told", () => {
  it("six hours out is urgent, not open", () => {
    // The case this exists for: a Lithuanian client browsing at 22:00 local
    // for a lot selling at 10:00 Eastern the same night. It can be done, but
    // only if a person here sees it, so it must not look routine.
    expect(bidWindow(inHours(6), NOW).state).toBe("urgent");
  });

  it("the boundary belongs to the safer side", () => {
    expect(bidWindow(inHours(URGENT_WITHIN_HOURS), NOW).state).toBe("open");
    expect(bidWindow(inHours(URGENT_WITHIN_HOURS - 0.01), NOW).state).toBe("urgent");
  });
});

describe("too late for a form — the honest answer is a phone number", () => {
  it("thirty minutes out is closed", () => {
    expect(bidWindow(inHours(0.5), NOW).state).toBe("closed");
  });

  it("the boundary belongs to the safer side", () => {
    expect(bidWindow(inHours(TOO_LATE_WITHIN_HOURS), NOW).state).toBe("urgent");
    expect(bidWindow(inHours(TOO_LATE_WITHIN_HOURS - 0.01), NOW).state).toBe("closed");
  });

  it("a lot selling this instant is closed", () => {
    expect(bidWindow(NOW, NOW)).toEqual({ state: "closed", hoursLeft: 0 });
  });

  it("a lot that already sold is closed, with the negative time kept", () => {
    // Kept rather than clamped: "sold 3 hours ago" is a different message from
    // "closing soon", and the page needs to be able to say so.
    const past = bidWindow(inHours(-3), NOW);
    expect(past.state).toBe("closed");
    expect(past.hoursLeft).toBe(-3);
  });
});

describe("an unknown sale time is never treated as late", () => {
  it("null is open", () => {
    // Lots with no scheduled auction date are common. Telling a client they
    // have run out of time when we do not know what the time is would be an
    // invented fact — and the platform's own Block Upcoming Lot Bid setting
    // already covers undated lots from the auction side.
    expect(bidWindow(null, NOW)).toEqual({ state: "open", hoursLeft: null });
    expect(bidWindow(undefined, NOW)).toEqual({ state: "open", hoursLeft: null });
  });
});

describe("acceptsBidRequests", () => {
  it("allows open and urgent, refuses closed", () => {
    expect(acceptsBidRequests(bidWindow(inHours(48), NOW))).toBe(true);
    expect(acceptsBidRequests(bidWindow(inHours(6), NOW))).toBe(true);
    expect(acceptsBidRequests(bidWindow(inHours(0.25), NOW))).toBe(false);
    expect(acceptsBidRequests(bidWindow(inHours(-1), NOW))).toBe(false);
  });

  it("allows a lot with no known sale time", () => {
    expect(acceptsBidRequests(bidWindow(null, NOW))).toBe(true);
  });
});

describe("the thresholds stay in a sane order", () => {
  it("urgent is wider than too-late", () => {
    // If these ever crossed, `urgent` would become unreachable and every tight
    // request would jump straight from open to closed with no warning state.
    expect(URGENT_WITHIN_HOURS).toBeGreaterThan(TOO_LATE_WITHIN_HOURS);
    expect(TOO_LATE_WITHIN_HOURS).toBeGreaterThan(0);
  });
});
