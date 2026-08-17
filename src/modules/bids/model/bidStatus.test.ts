import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  declineNeedsReason,
  isAllowedTransition,
  isBidRequestStatus,
  needsAnswer,
  BID_REQUEST_STATUSES,
} from "./bidStatus";

describe("what an admin may do next", () => {
  it("answers a new request by accepting or refusing it", () => {
    expect(allowedTransitions("requested")).toEqual(["accepted", "declined"]);
  });

  it("lets us go back on an acceptance, because a deposit can fail to arrive", () => {
    expect(isAllowedTransition("accepted", "declined")).toBe(true);
  });

  it("REFUSES to mark a bid won when no bid was ever placed", () => {
    /**
     * The rule this table exists for. It reads as pedantry until somebody
     * clicks "won" on a fresh request and the case file that follows says a
     * client bought a car we never bid on.
     */
    expect(isAllowedTransition("requested", "won")).toBe(false);
    expect(isAllowedTransition("accepted", "won")).toBe(false);
    expect(isAllowedTransition("placed", "won")).toBe(true);
  });

  it("leaves the auction's own outcome to the auction", () => {
    expect(allowedTransitions("placed")).toEqual(["won", "lost"]);
  });

  it("never offers to cancel on the client's behalf", () => {
    // "Cancelled" means the client withdrew. An admin setting it would leave a
    // record saying somebody changed their mind when they did not.
    for (const status of BID_REQUEST_STATUSES) {
      expect(allowedTransitions(status)).not.toContain("cancelled");
    }
  });

  it("treats every finished state as finished", () => {
    for (const status of ["declined", "cancelled", "won", "lost"] as const) {
      expect(allowedTransitions(status)).toEqual([]);
    }
  });

  it("covers every status in the schema, so a new one cannot be forgotten", () => {
    // A status added to the column with no entry here would return undefined
    // and crash the queue rather than simply offering nothing.
    for (const status of BID_REQUEST_STATUSES) {
      expect(Array.isArray(allowedTransitions(status))).toBe(true);
    }
  });
});

describe("guards", () => {
  it("insists a refusal says why", () => {
    expect(declineNeedsReason("declined")).toBe(true);
    expect(declineNeedsReason("accepted")).toBe(false);
  });

  it("rejects anything that is not a status, because these arrive from a body", () => {
    expect(isBidRequestStatus("won")).toBe(true);
    expect(isBidRequestStatus("WON")).toBe(false);
    expect(isBidRequestStatus("")).toBe(false);
    expect(isBidRequestStatus(undefined)).toBe(false);
    expect(isBidRequestStatus({ status: "won" })).toBe(false);
  });

  it("knows which rows have a client waiting on a reply", () => {
    expect(needsAnswer("requested")).toBe(true);
    expect(needsAnswer("accepted")).toBe(false);
    expect(needsAnswer("placed")).toBe(false);
  });
});
