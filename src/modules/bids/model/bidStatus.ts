import { BID_REQUEST_STATUSES, type BidRequestStatus } from "@/shared/db/schema";

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
