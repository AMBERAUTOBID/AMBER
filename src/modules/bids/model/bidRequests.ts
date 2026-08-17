/**
 * The lifecycle of a bid instruction: a client authorises a maximum, a person
 * here agrees to it, and somebody places it by hand at the auction.
 *
 * Three rules, all of them the same rules `deposits.ts` follows, and for the
 * same reasons — this is the second table in the codebase that records money
 * somebody committed to:
 *
 * 1. **The lot is read from our own fetch, never from the request body.** A
 *    caller who could supply the title and price could instruct us to bid on
 *    "Ferrari — $500" and the admin screen would show exactly that.
 * 2. **The fee and the deposit are computed server-side** from the plan table
 *    and the deposit rule, then frozen on the row.
 * 3. **Asking grants nothing.** Only an admin moving the row to `accepted`
 *    means we will actually bid.
 */
import { and, desc, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { recordAudit } from "@/shared/db/audit";
import { OPEN_BID_REQUEST_STATUSES, type BidRequestStatus } from "@/shared/db/schema";
import { PLANS, type PlanKey } from "@/modules/plans/model/plans";
import { can, type Actor } from "@/modules/plans/model/can";
import { bidDepositFor, depositOverrideNeedsPassword } from "./bidDeposit";
import { canClientWithdraw, declineNeedsReason, isAllowedTransition } from "./bidStatus";
import { acceptsBidRequests, bidWindow } from "./bidWindow";

/** Everything we need about the car — all of it fetched by us. */
export interface LotFacts {
  platform: "copart" | "iaai";
  lotNumber: string;
  vin: string | null;
  title: string;
  imageUrl: string | null;
  auctionAt: Date | null;
}

export type CreateResult =
  | { status: "created"; id: string; depositRequiredCents: number }
  /** The plan refused it. `reason` is can()'s own machine-readable answer. */
  | { status: "denied"; reason: string }
  /** Too close to the hammer for a form to promise anything. */
  | { status: "too_late" }
  /** They already have a live instruction on this car. */
  | { status: "already_open"; id: string }
  /** Above every tier we sell — a person must quote this one. */
  | { status: "needs_quote" };

/**
 * The client authorises a maximum bid on one lot.
 *
 * **This is the first caller of `can()` with real data.** The action carries
 * the AMOUNTS of their other live instructions rather than a count, because
 * the conditional concurrency rule ("N lots at a time, when each is under $X")
 * is a statement about every bid in the set — see judgeBidRequest.
 */
export async function createBidRequest(input: {
  actor: Actor & { id: string };
  lot: LotFacts;
  maxBidUsdCents: number;
  clientNote?: string;
  acceptedTerms: boolean;
  now?: Date;
}): Promise<CreateResult> {
  const now = input.now ?? new Date();

  // Checked before anything is written: a lot that has already sold, or is
  // minutes from selling, must not produce a row that looks like a live
  // instruction. The page shows a phone number instead.
  if (!acceptsBidRequests(bidWindow(input.lot.auctionAt, now))) return { status: "too_late" };

  const live = await liveInstructionsFor(input.actor.id);
  const duplicate = live.find(
    (row) => row.platform === input.lot.platform && row.lotNumber === input.lot.lotNumber
  );
  // Answered before the insert as well as by the partial unique index, so the
  // client gets a sentence rather than a constraint violation.
  if (duplicate) return { status: "already_open", id: duplicate.id };

  const decision = can(input.actor, {
    type: "place_bid_request",
    amountUsd: Math.round(input.maxBidUsdCents / 100),
    activeBidsUsd: live.map((row) => Math.round(row.maxBidUsdCents / 100)),
  });
  if (!decision.allowed) return { status: "denied", reason: decision.reason };

  const planKey = input.actor.activePlanKey;
  const plan = planKey ? PLANS[planKey] : null;
  // can() already refused a client with no plan, so this cannot be null here.
  // Read defensively anyway rather than asserting: an empty fee list is a real
  // catalogue state ("no fee published"), and it must mean zero, not a crash.
  const feeUsdCents = plan?.feesPerVehicleUsdCents[0] ?? 0;

  const deposit = depositForClient(planKey, input.maxBidUsdCents);
  if (deposit.kind === "beyond_tiers") return { status: "needs_quote" };

  const rows = await db()
    .insert(schema.bidRequests)
    .values({
      userId: input.actor.id,
      platform: input.lot.platform,
      lotNumber: input.lot.lotNumber,
      vin: input.lot.vin,
      title: input.lot.title,
      imageUrl: input.lot.imageUrl,
      auctionAt: input.lot.auctionAt,
      maxBidUsdCents: input.maxBidUsdCents,
      feeUsdCents,
      planKeyAtRequest: planKey,
      clientNote: input.clientNote?.trim().slice(0, 500) || null,
      depositRequiredCents: deposit.cents,
      depositDefaultCents: deposit.cents,
      depositStatus: deposit.cents > 0 ? "awaiting" : "not_required",
      // Stamped here, never taken from the browser — a timestamp the client
      // supplied would be worthless as evidence of what they agreed to.
      termsAcceptedAt: input.acceptedTerms ? now : null,
    })
    .returning({ id: schema.bidRequests.id });

  await recordAudit(input.actor.id, "bid.requested", "bid_request", rows[0].id, {
    lot: `${input.lot.platform}:${input.lot.lotNumber}`,
    maxBidUsdCents: input.maxBidUsdCents,
    feeUsdCents,
    depositRequiredCents: deposit.cents,
    planKey,
  });

  return { status: "created", id: rows[0].id, depositRequiredCents: deposit.cents };
}

/**
 * What a given client owes as a hold on a given bid.
 *
 * **A client already on a deposit tier posts nothing per car.** That is the
 * whole thing their tier deposit bought, and charging twice would make the
 * paid plans worse value than the free one — the exact inversion the free
 * tier's uncapped bidding already risks.
 */
export function depositForClient(
  planKey: PlanKey | null,
  maxBidUsdCents: number
): { kind: "none" | "per_car" | "needs_plan" | "beyond_tiers"; cents: number } {
  if (planKey && PLANS[planKey].depositUsdCents > 0) return { kind: "none", cents: 0 };
  const deposit = bidDepositFor(maxBidUsdCents);
  return deposit.kind === "none" || deposit.kind === "beyond_tiers"
    ? { kind: deposit.kind, cents: 0 }
    : { kind: deposit.kind, cents: deposit.cents };
}

export interface LiveInstruction {
  id: string;
  platform: string;
  lotNumber: string;
  maxBidUsdCents: number;
}

/**
 * The client's instructions that are still live — what `can()` measures a new
 * one against.
 *
 * Exactly `OPEN_BID_REQUEST_STATUSES` and nothing else. A declined, cancelled
 * or finished instruction consumes no allowance, and counting one would refuse
 * a client for bids that no longer exist.
 */
export async function liveInstructionsFor(userId: string): Promise<LiveInstruction[]> {
  return db()
    .select({
      id: schema.bidRequests.id,
      platform: schema.bidRequests.platform,
      lotNumber: schema.bidRequests.lotNumber,
      maxBidUsdCents: schema.bidRequests.maxBidUsdCents,
    })
    .from(schema.bidRequests)
    .where(
      and(
        eq(schema.bidRequests.userId, userId),
        inArray(schema.bidRequests.status, [...OPEN_BID_REQUEST_STATUSES])
      )
    );
}

export interface BidRequestRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  platform: string;
  lotNumber: string;
  vin: string | null;
  title: string;
  imageUrl: string | null;
  auctionAt: Date | null;
  maxBidUsdCents: number;
  feeUsdCents: number;
  planKeyAtRequest: string | null;
  clientNote: string | null;
  depositRequiredCents: number;
  depositDefaultCents: number;
  depositStatus: string;
  status: BidRequestStatus;
  /**
   * Why we refused. **Written for the client and shown to them verbatim** —
   * the column exists because a refusal with no reason generates a phone call.
   */
  declineReason: string | null;
  /** The case file, once a won instruction became a bought car. */
  orderId: string | null;
  createdAt: Date;
}

const ROW_COLUMNS = {
  id: schema.bidRequests.id,
  userId: schema.bidRequests.userId,
  userName: schema.users.name,
  userEmail: schema.users.email,
  platform: schema.bidRequests.platform,
  lotNumber: schema.bidRequests.lotNumber,
  vin: schema.bidRequests.vin,
  title: schema.bidRequests.title,
  imageUrl: schema.bidRequests.imageUrl,
  auctionAt: schema.bidRequests.auctionAt,
  maxBidUsdCents: schema.bidRequests.maxBidUsdCents,
  feeUsdCents: schema.bidRequests.feeUsdCents,
  planKeyAtRequest: schema.bidRequests.planKeyAtRequest,
  clientNote: schema.bidRequests.clientNote,
  depositRequiredCents: schema.bidRequests.depositRequiredCents,
  depositDefaultCents: schema.bidRequests.depositDefaultCents,
  depositStatus: schema.bidRequests.depositStatus,
  status: schema.bidRequests.status,
  declineReason: schema.bidRequests.declineReason,
  orderId: schema.bidRequests.orderId,
  createdAt: schema.bidRequests.createdAt,
};

/**
 * The admin queue: everything still live, **soonest sale first**.
 *
 * Ordered by the auction clock rather than by when it was asked, because the
 * only deadline that matters belongs to the auction. A request made this
 * morning for a lot selling next week is not more urgent than one made ten
 * minutes ago for a lot selling tonight, and a queue sorted by arrival would
 * say it was. Lots with no known sale date sort last — nothing is expiring.
 */
export async function openBidRequests(): Promise<BidRequestRow[]> {
  return db()
    .select(ROW_COLUMNS)
    .from(schema.bidRequests)
    .innerJoin(schema.users, eq(schema.bidRequests.userId, schema.users.id))
    .where(inArray(schema.bidRequests.status, [...OPEN_BID_REQUEST_STATUSES]))
    .orderBy(sql`${schema.bidRequests.auctionAt} asc nulls last`);
}

/** One client's own instructions, newest first. */
export async function bidRequestsFor(userId: string): Promise<BidRequestRow[]> {
  return db()
    .select(ROW_COLUMNS)
    .from(schema.bidRequests)
    .innerJoin(schema.users, eq(schema.bidRequests.userId, schema.users.id))
    .where(eq(schema.bidRequests.userId, userId))
    .orderBy(desc(schema.bidRequests.createdAt));
}

/**
 * Instructions we agreed to and never marked as placed, whose auction has
 * already run.
 *
 * **The silent failure this whole feature exists to prevent.** The timing rule
 * on the vehicle page stops a client asking too late; nothing stops us
 * accepting in good time and then missing it. Nobody gets an error — the
 * client believes we bid, and finds out weeks later. So the queue asks the
 * question out loud instead of waiting to be asked.
 */
export async function missedBidRequests(now = new Date()): Promise<BidRequestRow[]> {
  return db()
    .select(ROW_COLUMNS)
    .from(schema.bidRequests)
    .innerJoin(schema.users, eq(schema.bidRequests.userId, schema.users.id))
    .where(
      and(
        eq(schema.bidRequests.status, "accepted"),
        isNotNull(schema.bidRequests.auctionAt),
        lt(schema.bidRequests.auctionAt, now)
      )
    )
    .orderBy(schema.bidRequests.auctionAt);
}

export type StatusChangeResult =
  | { status: "applied"; to: BidRequestStatus }
  | { status: "not_allowed"; from: BidRequestStatus }
  | { status: "needs_reason" }
  | { status: "not_found" };

/**
 * An admin answers or advances one instruction.
 *
 * ── THE GUARD IS THE UPDATE, NOT A CHECK BEFORE IT ──────────────────────
 * The legality of the move is decided from the row we read, and then the
 * WHERE clause requires the status to **still** be that value. Two admins
 * pressing "accepted" and "declined" a second apart would otherwise both read
 * `requested`, both find their move legal, and the second would silently
 * overwrite the first — leaving a client told one thing and a queue showing
 * another. The same conditional-update discipline `deleteAccount()` uses,
 * and for the same reason: this codebase has no interactive transactions.
 *
 * `reviewedAt` is stamped on every move rather than only on the first, because
 * the question it answers is "when did somebody last take responsibility for
 * this", not "when was it first seen".
 */
export async function setBidStatus(input: {
  requestId: string;
  to: BidRequestStatus;
  adminId: string;
  /** Told to the client verbatim. Required when declining. */
  reason?: string | null;
}): Promise<StatusChangeResult> {
  const rows = await db()
    .select({ status: schema.bidRequests.status, userId: schema.bidRequests.userId })
    .from(schema.bidRequests)
    .where(eq(schema.bidRequests.id, input.requestId))
    .limit(1);

  const row = rows[0];
  if (!row) return { status: "not_found" };
  if (!isAllowedTransition(row.status, input.to)) return { status: "not_allowed", from: row.status };

  const reason = input.reason?.trim() || null;
  if (declineNeedsReason(input.to) && !reason) return { status: "needs_reason" };

  const claimed = await db()
    .update(schema.bidRequests)
    .set({
      status: input.to,
      reviewedBy: input.adminId,
      reviewedAt: new Date(),
      // Kept only where it means something. A reason carried over from an
      // earlier refusal onto a later acceptance would be shown to the client
      // as our explanation for a decision it does not describe.
      ...(input.to === "declined" ? { declineReason: reason } : {}),
      ...(input.to === "placed" ? { placedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.bidRequests.id, input.requestId), eq(schema.bidRequests.status, row.status))
    )
    .returning({ id: schema.bidRequests.id });

  // Somebody else moved it between our read and our write.
  if (!claimed[0]) return { status: "not_allowed", from: row.status };

  await recordAudit(input.adminId, "bid.status_set", "bid_request", input.requestId, {
    userId: row.userId,
    from: row.status,
    to: input.to,
    reason,
  });

  return { status: "applied", to: input.to };
}

export type WithdrawResult =
  | { status: "withdrawn"; hadBeenAccepted: boolean; depositHeldCents: number }
  | { status: "too_late" }
  | { status: "not_found" };

/**
 * A client takes their own instruction back.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
 * **It never touches the deposit.** The owner's rule (2026-08-17) is that a
 * withdrawn deposit is normally returned but an admin decides, so this function
 * leaves `depositStatus` exactly as it found it and reports what is being held.
 * Returning money is a decision with a person's name on it; a client pressing a
 * button on their own page is not that.
 *
 * ── THE THREE GUARDS, EACH FOR A DIFFERENT FAILURE ──────────────────────
 * 1. **Ownership is in the WHERE clause**, not in a check the caller is trusted
 *    to have made — the same shape as `getOrderForUser`.
 * 2. **The window is re-checked here**, not just in the page that drew the
 *    button. A page rendered an hour ago still shows a button that a form post
 *    would otherwise honour, and an hour is exactly the kind of gap that puts a
 *    withdrawal inside the danger zone.
 * 3. **The UPDATE is conditional on the status we read.** If an admin marked
 *    the bid placed a second ago, the claim finds nothing and the client is
 *    told it is too late — rather than being told they are out of a car that
 *    has a live bid on it.
 *
 * `hadBeenAccepted` comes from `reviewedAt`, which only an admin action ever
 * sets. It is what tells the console whether this withdrawal needs somebody to
 * go and check that no bid is live at the auction.
 */
export async function withdrawBidRequest(
  requestId: string,
  userId: string,
  now = new Date()
): Promise<WithdrawResult> {
  const rows = await db()
    .select({
      status: schema.bidRequests.status,
      auctionAt: schema.bidRequests.auctionAt,
      reviewedAt: schema.bidRequests.reviewedAt,
      depositStatus: schema.bidRequests.depositStatus,
      depositRequiredCents: schema.bidRequests.depositRequiredCents,
    })
    .from(schema.bidRequests)
    .where(and(eq(schema.bidRequests.id, requestId), eq(schema.bidRequests.userId, userId)))
    .limit(1);

  const row = rows[0];
  // Same answer for "no such request" and "not yours", so ids cannot be probed.
  if (!row) return { status: "not_found" };

  if (!canClientWithdraw(row.status, bidWindow(row.auctionAt, now).state)) {
    return { status: "too_late" };
  }

  const claimed = await db()
    .update(schema.bidRequests)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(schema.bidRequests.id, requestId),
        eq(schema.bidRequests.userId, userId),
        eq(schema.bidRequests.status, row.status)
      )
    )
    .returning({ id: schema.bidRequests.id });

  if (!claimed[0]) return { status: "too_late" };

  // The actor is the CLIENT here, which is unusual for this log and is the
  // point: an instruction that vanished needs to say who withdrew it.
  await recordAudit(userId, "bid.withdrawn_by_client", "bid_request", requestId, {
    from: row.status,
    hadBeenAccepted: row.reviewedAt !== null,
    depositStatus: row.depositStatus,
    depositRequiredCents: row.depositRequiredCents,
  });

  return {
    status: "withdrawn",
    hadBeenAccepted: row.reviewedAt !== null,
    depositHeldCents: row.depositStatus === "received" ? row.depositRequiredCents : 0,
  };
}

/**
 * Withdrawn instructions that still need somebody here to do something.
 *
 * Two different obligations, deliberately in one list because both are answered
 * by opening the same row:
 *
 * 1. **We had accepted it** (`reviewedAt` is set — only an admin sets that).
 *    Somebody must confirm no bid is live at the auction, because the database
 *    cannot know what BidManager knows.
 * 2. **We are holding their money** (`deposit_status = 'received'`). Without
 *    this the row would leave the queue with the deposit still ours.
 *
 * ⚠️ Bounded to `WITHDRAWN_REVIEW_DAYS` for the first case, because there is no
 * "an admin has seen this" column and inventing one needs a migration. A row
 * holding money is NOT time-bounded — that one stays until the deposit moves,
 * which is the honest behaviour for money.
 */
export const WITHDRAWN_REVIEW_DAYS = 7;

export async function withdrawnNeedingAttention(now = new Date()): Promise<BidRequestRow[]> {
  const since = new Date(now.getTime() - WITHDRAWN_REVIEW_DAYS * 24 * 3_600_000);
  return db()
    .select(ROW_COLUMNS)
    .from(schema.bidRequests)
    .innerJoin(schema.users, eq(schema.bidRequests.userId, schema.users.id))
    .where(
      and(
        eq(schema.bidRequests.status, "cancelled"),
        or(
          eq(schema.bidRequests.depositStatus, "received"),
          and(isNotNull(schema.bidRequests.reviewedAt), gt(schema.bidRequests.updatedAt, since))
        )
      )
    )
    .orderBy(desc(schema.bidRequests.updatedAt));
}

export type OverrideResult =
  | { status: "applied"; depositCents: number }
  | { status: "needs_password" }
  | { status: "not_found" };

/**
 * An admin changes the security deposit on one instruction.
 *
 * `passwordVerified` is decided by the route, not here — this function refuses
 * to lower a deposit without it, but knows nothing about how a password is
 * checked. That split keeps the rule ("only the risk-increasing direction is
 * guarded") testable without hashing anything.
 */
export async function setBidDeposit(
  requestId: string,
  depositCents: number,
  adminId: string,
  passwordVerified: boolean
): Promise<OverrideResult> {
  const rows = await db()
    .select({
      defaultCents: schema.bidRequests.depositDefaultCents,
      currentCents: schema.bidRequests.depositRequiredCents,
      userId: schema.bidRequests.userId,
    })
    .from(schema.bidRequests)
    .where(and(eq(schema.bidRequests.id, requestId), ne(schema.bidRequests.status, "won")))
    .limit(1);

  const row = rows[0];
  if (!row) return { status: "not_found" };

  const cents = Math.max(0, Math.round(depositCents));
  if (depositOverrideNeedsPassword(row.defaultCents, cents) && !passwordVerified) {
    return { status: "needs_password" };
  }

  const lowered = cents < row.defaultCents;
  await db()
    .update(schema.bidRequests)
    .set({
      depositRequiredCents: cents,
      depositStatus: cents > 0 ? "awaiting" : "not_required",
      // Stamped only when the rule was relaxed. Raising a deposit is somebody
      // being careful, and recording it as an "override" would bury the ones
      // that matter among the ones that do not.
      ...(lowered ? { depositOverrideBy: adminId, depositOverrideAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.bidRequests.id, requestId));

  await recordAudit(adminId, "bid.deposit_set", "bid_request", requestId, {
    userId: row.userId,
    fromCents: row.currentCents,
    toCents: cents,
    ruleDefaultCents: row.defaultCents,
    lowered,
  });
  return { status: "applied", depositCents: cents };
}
