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
  /**
   * `activeBidsUsd` is the AMOUNTS of the bids already live for this client,
   * not merely how many there are.
   *
   * It carries the amounts because the conditional rule — "N lots at a time,
   * when each bid is under $X" — is a statement about every bid in the set,
   * not just the incoming one. Given only a count, a client holding one
   * $20,000 bid could add a $5,000 one and end up with two live bids where
   * the plan promised two only while each stayed under $10,000. The count is
   * still available as `.length`, so nothing is lost by passing the fuller
   * fact.
   */
  | { type: "place_bid_request"; amountUsd: number; activeBidsUsd: number[] }
  | { type: "view_night_reserve" }
  | { type: "join_live_auction" }
  | { type: "self_bid" }
  /**
   * Saving a car to favourites. Gates *writing* only — reading the list
   * deliberately does not come through here, so a client whose deposit is
   * refunded keeps their collection and can still open and prune it. Losing
   * a plan should not read as losing everything you collected.
   *
   * Every plan allows it, so this is currently equivalent to "has a plan".
   * It is still an action rather than an inline `activePlanKey` check,
   * because that inline check is exactly how limits start being re-derived
   * outside can() — and a future plan that caps saved cars needs a hook that
   * already exists.
   */
  | { type: "save_favorite" }
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
  // A verified email is required of EVERYONE, admins included, and is checked
  // before role. Today an unverified account cannot obtain a session at all
  // (loginAccount refuses it), so this is defence in depth rather than a live
  // hole — but the moment some future path creates a session another way,
  // say auto-login straight after registration, an unverified address would
  // otherwise reach the admin console with nothing failing loudly to say so.
  // The account that approves deposits must have a mailbox someone proved
  // they control, because that mailbox can reset its password.
  if (!actor.emailVerified) return deny("email_not_verified");

  // Admins bypass plan limits — they place bids *for* clients, and their
  // actions are recorded in the audit log rather than constrained here.
  // They do not bypass the admin gate itself, which checks the role.
  if (action.type === "access_admin") {
    return actor.role === "admin" ? allow : deny("not_admin");
  }
  if (actor.role === "admin") return allow;

  const plan = actor.activePlanKey ? PLANS[actor.activePlanKey] : null;
  if (!plan) return deny("no_active_plan");

  switch (action.type) {
    case "place_bid_request":
      return judgeBidRequest(plan, action);
    case "view_night_reserve":
      return plan.nightReserveVisible ? allow : deny("plan_lacks_night_reserve");
    case "join_live_auction":
      return plan.liveAuctionAccess ? allow : deny("plan_lacks_live_auction");
    case "save_favorite":
      // Reaching here means a plan exists, which is the whole requirement.
      return allow;
    case "self_bid":
      // Eligibility (plan) and grant (admin action) are both required —
      // in that order, so the deny reason tells the user their real next
      // step: upgrade the plan, or contact us for the grant.
      if (!plan.selfBiddingEligible) return deny("self_bidding_not_eligible");
      return actor.selfBiddingGranted ? allow : deny("self_bidding_not_granted");
  }
}

/**
 * The bidding rules, in the order a client would hit them.
 *
 * **The conditional concurrency rule is the subtle one.** A tier reads "bid
 * on up to 2 lots at a time (when each bid is under $10,000)", and the
 * allowance therefore depends on the SIZE of the bids, not only their number:
 * above the threshold the client may hold exactly one, because the deposit
 * behind the plan is what our own exposure is measured against, and two
 * $25,000 bids on a $2,500 deposit is a different business than two $8,000
 * ones.
 *
 * "Each bid" means each — the incoming one and the ones already live. A rule
 * that only inspected the new bid would let the set drift over the threshold
 * one small bid at a time, which is precisely the case a client would find
 * first and we would find last.
 *
 * Until Phase 2.3 exists nothing calls this with real data. It is implemented
 * anyway because the plan cards describe it to paying customers, and a limit
 * that lives only in prose is one nobody can be held to.
 */
function judgeBidRequest(
  plan: Plan,
  action: Extract<Action, { type: "place_bid_request" }>
): Decision {
  if (plan.maxBidUsd !== null && action.amountUsd > plan.maxBidUsd) {
    return deny("bid_amount_over_plan_limit");
  }
  if (plan.maxConcurrentBids === null) return allow;

  const threshold = plan.concurrencyThresholdUsd;
  const anyOverThreshold =
    threshold !== null &&
    (action.amountUsd > threshold || action.activeBidsUsd.some((amount) => amount > threshold));

  const allowance = anyOverThreshold ? 1 : plan.maxConcurrentBids;
  if (action.activeBidsUsd.length >= allowance) {
    return deny("concurrent_bid_limit_reached");
  }
  return allow;
}
