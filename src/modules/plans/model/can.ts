/**
 * can() — the single authorization decision point for everything a plan
 * governs. UI, API routes, and the admin console all call this; none of them
 * may re-derive a rule from the plan table themselves. The payoff: when a
 * limit changes, it changes in plans.ts and every gate moves together, and
 * the exhaustive tests in can.test.ts are tests of the *real* security
 * boundary rather than of copies of it.
 *
 * Deny results carry a machine-readable reason so callers can show the right
 * message ("bid above your plan limit" vs "verify your email first") without
 * string-matching, and so the audit log can record *why* something was
 * refused.
 *
 * Server-side only enforcement is the rule: the UI may also call can() to
 * grey out buttons, but the API route MUST make its own can() call on every
 * request — a client that skips the UI skips nothing.
 */
import { PLANS, type Plan, type PlanKey } from "./plans";

/** The identity facts can() judges. A thin projection of the users row. */
export interface Actor {
  role: "client" | "admin";
  emailVerified: boolean;
  /** Null = registered, no confirmed deposit/plan yet. */
  activePlanKey: PlanKey | null;
  /** The per-user admin grant — see plans.ts on why this is separate. */
  selfBiddingGranted: boolean;
}

export type Action =
  | { type: "place_bid_request"; amountUsd: number; activeBidCount: number }
  | { type: "view_night_reserve" }
  | { type: "join_live_auction" }
  | { type: "self_bid" }
  | { type: "access_admin" };

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: DenyReason };

export type DenyReason =
  | "email_not_verified"
  | "no_active_plan"
  | "bid_amount_over_plan_limit"
  | "concurrent_bid_limit_reached"
  | "plan_lacks_night_reserve"
  | "plan_lacks_live_auction"
  | "self_bidding_not_granted"
  | "self_bidding_not_eligible"
  | "not_admin";

const allow: Decision = { allowed: true };
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

export function can(actor: Actor, action: Action): Decision {
  // Admins bypass plan limits — they place bids *for* clients, and their
  // actions are recorded in the audit log rather than constrained here.
  // They do not bypass the admin gate itself, which checks the role.
  if (action.type === "access_admin") {
    return actor.role === "admin" ? allow : deny("not_admin");
  }
  if (actor.role === "admin") return allow;

  // Order matters: the most actionable problem first. An unverified email is
  // fixable in one click; telling that user about plan limits helps nobody.
  if (!actor.emailVerified) return deny("email_not_verified");

  const plan = actor.activePlanKey ? PLANS[actor.activePlanKey] : null;
  if (!plan) return deny("no_active_plan");

  switch (action.type) {
    case "place_bid_request":
      return judgeBidRequest(plan, action);
    case "view_night_reserve":
      return plan.nightReserveVisible ? allow : deny("plan_lacks_night_reserve");
    case "join_live_auction":
      return plan.liveAuctionAccess ? allow : deny("plan_lacks_live_auction");
    case "self_bid":
      // Eligibility (plan) and grant (admin action) are both required —
      // in that order, so the deny reason tells the user their real next
      // step: upgrade the plan, or contact us for the grant.
      if (!plan.selfBiddingEligible) return deny("self_bidding_not_eligible");
      return actor.selfBiddingGranted ? allow : deny("self_bidding_not_granted");
  }
}

function judgeBidRequest(
  plan: Plan,
  action: Extract<Action, { type: "place_bid_request" }>
): Decision {
  if (plan.maxBidUsd !== null && action.amountUsd > plan.maxBidUsd) {
    return deny("bid_amount_over_plan_limit");
  }
  if (plan.maxConcurrentBids !== null && action.activeBidCount >= plan.maxConcurrentBids) {
    return deny("concurrent_bid_limit_reached");
  }
  return allow;
}
