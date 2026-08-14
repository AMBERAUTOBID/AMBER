/**
 * How much time is left to actually place a bid — the rule that decides what
 * the button on a lot page is allowed to promise.
 *
 * ── WHY A TIMING RULE IS NEEDED AT ALL ──────────────────────────────────
 * We place every one of these by hand. US auctions run 09:00–18:00 Eastern,
 * which is 16:00–01:00 Lithuanian time, so a client in Vilnius is typically
 * asleep when their lot sells and cannot be asked anything at the moment it
 * matters. The instruction has to arrive early enough for a person here to
 * read it, agree to it, and get to the auction's screen.
 *
 * The failure this prevents is specific and expensive: a request that arrives
 * ten minutes before the hammer, sits unseen, and leaves a client who believes
 * we were bidding for them. **An accepted instruction we did not act on is far
 * worse than a refused one** — the refusal is a disappointment, the silence is
 * a broken promise.
 *
 * ── THREE STATES, NOT A YES/NO ──────────────────────────────────────────
 * A single cutoff would be wrong in both directions: refuse at three hours and
 * we turn away business we could easily have done; accept at ten minutes and
 * we promise something we cannot deliver. So:
 *
 *   open   — plenty of time; the ordinary path.
 *   urgent — it can probably still be done, but not silently. The client is
 *            told it is tight and the admin queue puts it first.
 *   closed — a form submission cannot be relied on. The button becomes a
 *            phone number, which is the honest answer rather than a refusal:
 *            a person ringing us at this point may well still get the bid in.
 *
 * ⚠️ **Both thresholds are commercial judgements, not facts, and they are
 * deliberately the only two numbers here so the owner can move them.**
 *
 * Set by the owner 2026-08-14 to the cautious pair: a full day of warning, and
 * four hours as the point where a web form stops being an honest channel. The
 * looser 12/2 was offered and turned down, and the reasoning behind that is
 * worth keeping — the cost of the two mistakes is not symmetric. Sending a
 * client to the phone when we could have managed it loses one deal; accepting
 * an instruction we then miss loses the client.
 */
export const URGENT_WITHIN_HOURS = 24;
export const TOO_LATE_WITHIN_HOURS = 4;

export type BidWindowState = "open" | "urgent" | "closed";

export interface BidWindow {
  state: BidWindowState;
  /** Hours until the sale. Null when the sale time is unknown. */
  hoursLeft: number | null;
}

/**
 * `saleAt` null means the source did not give us a sale time — common on lots
 * whose auction date has not been set. **Treated as open, never as late**: we
 * cannot tell a client they have run out of time when we do not know what the
 * time is, and the platform's own "Block Upcoming Lot Bid" protection already
 * covers undated lots on the auction side.
 */
export function bidWindow(saleAt: Date | null | undefined, now: Date): BidWindow {
  if (!saleAt) return { state: "open", hoursLeft: null };

  const hoursLeft = (saleAt.getTime() - now.getTime()) / 3_600_000;

  // Already sold, or selling right now. Not a judgement call.
  if (hoursLeft <= 0) return { state: "closed", hoursLeft };
  if (hoursLeft < TOO_LATE_WITHIN_HOURS) return { state: "closed", hoursLeft };
  if (hoursLeft < URGENT_WITHIN_HOURS) return { state: "urgent", hoursLeft };
  return { state: "open", hoursLeft };
}

/** Whether a request may be created at all. Closed lots go to the phone. */
export function acceptsBidRequests(window: BidWindow): boolean {
  return window.state !== "closed";
}
