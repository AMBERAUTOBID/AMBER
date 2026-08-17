import {
  BID_REQUEST_STATUSES,
  OPEN_BID_REQUEST_STATUSES,
  type BidRequestStatus,
} from "@/shared/db/schema";

export { BID_REQUEST_STATUSES, type BidRequestStatus };

/**
 * Which state a bid instruction may move to, and from where.
 *
 * ── WHY THIS IS A TABLE AND NOT AN `if` IN THE ROUTE ────────────────────
 * The states are not a progress bar; they are claims about the real world.
 * `placed` says a bid exists at an auction. `won` says a car has been bought
 * and somebody owes us fifteen thousand dollars for it. A route that accepted
 * any status it was handed would let a mis-click assert either — and the
 * damage is not the row, it is the invoice, the case file and the phone call
 * that follow from believing it.
 *
 * ── THE ONE RULE WORTH SAYING OUT LOUD ──────────────────────────────────
 * **`won` is reachable only from `placed`.** You cannot win a bid you never
 * made. That looks pedantic until an admin marks a request `won` straight from
 * `requested`, and the file that comes out of it says a client bought a car we
 * never bid on.
 *
 * `cancelled` is deliberately **not** reachable here. It means the client
 * withdrew, and it belongs to the client's own action — an admin cancelling
 * on somebody's behalf would leave a record saying the client changed their
 * mind when they did not.
 */
const TRANSITIONS: Record<BidRequestStatus, readonly BidRequestStatus[]> = {
  // Nobody has looked yet.
  requested: ["accepted", "declined"],
  // We agreed to place it — but agreeing is not doing, and a deposit that
  // never arrives is a perfectly good reason to go back on it.
  accepted: ["placed", "declined"],
  // The bid is in. From here the auction decides, not us.
  placed: ["won", "lost"],
  // Terminal, all four. A finished instruction is history; a client who wants
  // another go asks again, which is what the partial unique index allows.
  declined: [],
  cancelled: [],
  won: [],
  lost: [],
};

/** What an admin may move this instruction to. Empty once it is finished. */
export function allowedTransitions(from: BidRequestStatus): readonly BidRequestStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isAllowedTransition(from: BidRequestStatus, to: BidRequestStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * A refusal has to say why.
 *
 * The column's own comment puts it best: a refusal with no reason generates a
 * phone call. The client is told this text, so an empty one is not a small
 * omission — it is us declining to explain, in writing, to somebody who asked
 * us to spend their money.
 */
export function declineNeedsReason(to: BidRequestStatus): boolean {
  return to === "declined";
}

/** A runtime guard, because statuses arrive from a request body. */
export function isBidRequestStatus(value: unknown): value is BidRequestStatus {
  return typeof value === "string" && (BID_REQUEST_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether this instruction still needs somebody to do something.
 *
 * Used to split the queue: an admin opening the page wants the requests
 * nobody has answered separated from the ones already running, because those
 * are two different jobs and only the first has a client waiting on a reply.
 */
export function needsAnswer(status: BidRequestStatus): boolean {
  return status === "requested";
}

/**
 * Whether a client may withdraw their own instruction, unaided.
 *
 * ── THE RULE THE OWNER SET (2026-08-17) ─────────────────────────────────
 * They may take it back until we have confirmed the bid is placed — and, in
 * their own decision, no later than **24 hours before the sale**.
 *
 * ── WHY THE STATUS ALONE IS NOT ENOUGH ──────────────────────────────────
 * **The status lags the truth, and that is the whole danger here.** Every bid
 * is placed by hand in BidManager, so between the moment a bid actually goes in
 * and the moment somebody clicks "placed", the row still says `accepted` while
 * a live bid exists at the auction. A withdrawal taken on the row alone would
 * tell a client they were out of it, and then they would win a car they believe
 * they cancelled. Copart and IAA also accept bids days early, so that gap is
 * not always measured in minutes.
 *
 * The time rule is what covers it. **It is deliberately `bidWindow`'s existing
 * `open` state and not a new number**: `open` means more than
 * `URGENT_WITHIN_HOURS` (24) to the sale, which is exactly the period in which
 * nobody here is at an auction screen for this lot. Inside it, the page hands
 * the client a phone number rather than a button — the same answer, for the
 * same reason, that the request form gives when a lot is too close.
 *
 * Neither rule is a substitute for the other, and neither is a substitute for
 * an admin marking "placed" at the moment they place it.
 */
export function canClientWithdraw(
  status: BidRequestStatus,
  windowState: "open" | "urgent" | "closed"
): boolean {
  if (status !== "requested" && status !== "accepted") return false;
  return windowState === "open";
}

/**
 * Whether this instruction is still running, from the client's side.
 *
 * The same three states `OPEN_BID_REQUEST_STATUSES` counts against a plan's
 * concurrency allowance, and deliberately read from that constant rather than
 * listed again: **a client's "active" list and the limit they are held to must
 * never disagree.** If the two drifted, somebody would be told they had used
 * up their allowance while their own page showed fewer bids than that.
 */
export function isLiveInstruction(status: BidRequestStatus): boolean {
  return (OPEN_BID_REQUEST_STATUSES as readonly string[]).includes(status);
}
