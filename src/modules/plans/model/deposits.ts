/**
 * Deposit lifecycle: a client requests a plan, an admin confirms the money
 * arrived, the plan activates.
 *
 * No card payments by design (ARCHITECTURE.md §6). Deposits arrive by bank
 * transfer and a human confirms them, which is how the business already
 * works — and it keeps PCI scope, chargebacks and refund automation entirely
 * out of the codebase.
 *
 * Two rules enforced here rather than in the UI, because the UI is not a
 * security boundary:
 *
 * 1. The amount is read from the plan table, never from the request. A
 *    client cannot ask to deposit €1 for the top tier.
 * 2. Confirming a deposit is the ONLY thing that sets users.activePlanKey —
 *    with exactly one deliberate exception, `setPlanByAdmin`, which moves no
 *    money and says so loudly. Requesting a plan grants nothing.
 *
 * ── THE LEDGER INVARIANT ────────────────────────────────────────────────
 * This table is append-only in spirit: rows change status, never amount, and
 * a plan change ADDS a row rather than rewriting one. The rule everything
 * here serves is
 *
 *     Σ confirmed − Σ refunded = the money actually held for that client.
 *
 * So moving from a $1,500 tier to a $2,500 one leaves the first row confirmed
 * and writes a second for **$1,000 — the difference, which is what actually
 * transfers**. Superseding the old row and writing $2,500 would make our
 * register disagree with the client's bank statement, which is the one
 * document they can check us against.
 *
 * A "top-up" therefore needs no column: a row is one if a confirmed row
 * already existed when it was written. Derivable, and stable because nothing
 * ever deletes rows. It only affects a label.
 * ────────────────────────────────────────────────────────────────────────
 */
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { PLANS, type PlanKey } from "./plans";

/**
 * Statuses that mean **we are holding this client's money right now**.
 *
 * `refund_requested` counts: asking for a deposit back does not move it. The
 * money leaves when an admin marks it `refunded`, and until then the client's
 * plan is still paid for and still works.
 */
const HELD_STATUSES = ["confirmed", "refund_requested"] as const;

export interface Ledger {
  /** Money we hold for this client, USD cents. */
  heldCents: number;
  /**
   * Whether any held row exists at all — which is NOT the same as
   * `heldCents > 0`, because Bronze is free and its confirmed row is $0.
   *
   * Deliberately computed over held rows only: a client who was fully
   * refunded and comes back has no held rows, so they are a first-timer again
   * and pay the full deposit. Reading it over *all* rows would quietly charge
   * them a difference against money we no longer have.
   */
  hasHistory: boolean;
  /** A refund is asked for and not yet paid back. */
  refundPending: boolean;
}

/** What we hold for one client, in a single round trip. */
export async function ledgerFor(userId: string): Promise<Ledger> {
  const rows = await db()
    .select({ status: schema.deposits.status, amountCents: schema.deposits.amountCents })
    .from(schema.deposits)
    .where(
      and(eq(schema.deposits.userId, userId), inArray(schema.deposits.status, [...HELD_STATUSES]))
    );

  return {
    heldCents: rows.reduce((sum, r) => sum + r.amountCents, 0),
    hasHistory: rows.length > 0,
    refundPending: rows.some((r) => r.status === "refund_requested"),
  };
}

export type PlanChange =
  /** Nothing held: the client pays the tier's deposit in full. */
  | { kind: "first"; amountCents: number }
  /** Already holding money: they transfer the difference and nothing more. */
  | { kind: "top_up"; amountCents: number }
  /** The target costs no more than what we already hold — see below. */
  | { kind: "not_an_upgrade" };

/**
 * What a client would have to transfer to move to a given tier.
 *
 * Pure, and separated from the query for that reason: this is the arithmetic
 * the whole feature turns on, and it is worth testing at the boundaries
 * without a database. See planChange.test.ts.
 *
 * **`not_an_upgrade` is the entire client-facing downgrade policy.** There is
 * no self-service step down, by the owner's decision — and that decision is
 * what removes the question this feature was stuck on for a day, because with
 * no downgrade there is no "refund the difference or keep it as credit" to
 * answer. Somebody who wants a smaller commitment asks for the deposit back
 * and starts again. An admin may still move anyone either way; that path
 * moves no money and is `setPlanByAdmin`.
 */
export function planChangeFor(targetDepositCents: number, ledger: Ledger): PlanChange {
  if (!ledger.hasHistory) return { kind: "first", amountCents: targetDepositCents };
  if (targetDepositCents > ledger.heldCents) {
    return { kind: "top_up", amountCents: targetDepositCents - ledger.heldCents };
  }
  return { kind: "not_an_upgrade" };
}

export type RequestResult =
  | { status: "requested"; depositId: string; amountCents: number; topUp: boolean }
  /** An undecided request already exists — one open request at a time. */
  | { status: "already_pending"; depositId: string }
  /** Plan is shown on /plans but not yet selectable (Coming Soon). */
  | { status: "unavailable" }
  /** Same tier or lower. There is no self-service downgrade — see planChangeFor. */
  | { status: "not_an_upgrade" }
  /** They have asked for their money back; settle that before moving tiers. */
  | { status: "refund_pending" };

export async function requestPlan(
  userId: string,
  planKey: PlanKey,
  /** The client ticked the agreement box in the plan dialog. */
  acceptedTerms = false
): Promise<RequestResult> {
  // Checked here, not only in the UI. The Coming Soon cards render a Contact
  // link instead of a button, but a hand-crafted POST must fail too — a plan
  // we cannot yet service must never reach the deposit queue looking real.
  if (!PLANS[planKey].available) return { status: "unavailable" };

  const existing = await db()
    .select({ id: schema.deposits.id })
    .from(schema.deposits)
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "pending")))
    .limit(1);

  if (existing[0]) return { status: "already_pending", depositId: existing[0].id };

  const ledger = await ledgerFor(userId);
  // Refusing rather than queueing both: an upgrade and a refund are opposite
  // instructions about the same pot of money, and an admin who confirmed one
  // while the other sat in the queue would have to unpick it by hand.
  if (ledger.refundPending) return { status: "refund_pending" };

  const change = planChangeFor(PLANS[planKey].depositUsdCents, ledger);
  if (change.kind === "not_an_upgrade") return { status: "not_an_upgrade" };

  const rows = await db()
    .insert(schema.deposits)
    .values({
      userId,
      planKey,
      // From the catalogue minus what we already hold — computed server-side
      // from this client's own rows, never from the request. See rule 1.
      amountCents: change.amountCents,
      status: "pending",
      // Stamped server-side: the client tells us *that* they agreed, never
      // when. A timestamp supplied by the browser would be worthless as
      // evidence.
      termsAcceptedAt: acceptedTerms ? new Date() : null,
    })
    .returning({ id: schema.deposits.id });

  await recordAudit(userId, "deposit.requested", "deposit", rows[0].id, {
    planKey,
    acceptedTerms,
    amountCents: change.amountCents,
    heldCentsBefore: ledger.heldCents,
    topUp: change.kind === "top_up",
  });
  return {
    status: "requested",
    depositId: rows[0].id,
    amountCents: change.amountCents,
    topUp: change.kind === "top_up",
  };
}

export interface DepositRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planKey: string;
  /**
   * What this row asks the client to transfer — which on an upgrade is the
   * **difference**, not the tier's price. Read `userActivePlanKey` before
   * presenting it as a deposit.
   */
  amountCents: number;
  /**
   * The tier the client is on *while this request is open*. Non-null means
   * the row is a top-up, which is the whole of how a top-up is identified:
   * the table needs no column for it, because a row is one exactly when a
   * confirmed row already existed, and only a confirmed row grants a tier.
   */
  userActivePlanKey: string | null;
  status: string;
  createdAt: Date;
}

/** Selected identically by all three deposit readers below. */
const DEPOSIT_ROW_COLUMNS = {
  id: schema.deposits.id,
  userId: schema.deposits.userId,
  userEmail: schema.users.email,
  userName: schema.users.name,
  planKey: schema.deposits.planKey,
  amountCents: schema.deposits.amountCents,
  userActivePlanKey: schema.users.activePlanKey,
  status: schema.deposits.status,
  createdAt: schema.deposits.createdAt,
};

/** The admin queue: undecided requests, oldest first — a queue, not a feed. */
export async function pendingDeposits(): Promise<DepositRow[]> {
  return db()
    .select(DEPOSIT_ROW_COLUMNS)
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    // Erasure already cancels open requests, so a deleted user's row should
    // never be pending. Excluded here too because this list drives an action
    // with consequences: confirming a request from an account that no longer
    // exists would activate a plan for nobody.
    .where(and(eq(schema.deposits.status, "pending"), isNull(schema.users.deletedAt)))
    .orderBy(schema.deposits.createdAt);
}

export interface RefundRequestRow {
  userId: string;
  userEmail: string;
  userName: string;
  /** The tier they hold while the request is open — it keeps working. */
  planKey: string | null;
  /** The whole sum, across however many rows an upgrade path left behind. */
  heldCents: number;
  rows: number;
}

/**
 * Clients who have asked for their deposit back, one entry each.
 *
 * Grouped in JS for the same reason `activeClients` is — tens of clients, and
 * SQL a reader can follow beats a window function nobody revisits.
 *
 * **No date column, deliberately.** Nothing stamps *when* a refund was asked
 * for: the row's `createdAt` is when the deposit was requested, months
 * earlier, and `reviewedAt` belongs to the admin who eventually acts.
 * Printing either as "requested on" would be a plausible, wrong number on a
 * screen about money. When the timing matters it is in `audit_log` under
 * `deposit.refund_requested`; adding a column here is a migration, and the
 * queue is short enough that the honest omission costs nothing.
 */
export async function refundRequests(): Promise<RefundRequestRow[]> {
  const rows = await db()
    .select({
      userId: schema.deposits.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      planKey: schema.users.activePlanKey,
      amountCents: schema.deposits.amountCents,
    })
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(
      and(eq(schema.deposits.status, "refund_requested"), isNull(schema.users.deletedAt))
    );

  const byUser = new Map<string, RefundRequestRow>();
  for (const row of rows) {
    const entry = byUser.get(row.userId);
    if (entry) {
      entry.heldCents += row.amountCents;
      entry.rows += 1;
    } else {
      byUser.set(row.userId, {
        userId: row.userId,
        userEmail: row.userEmail,
        userName: row.userName,
        planKey: row.planKey,
        heldCents: row.amountCents,
        rows: 1,
      });
    }
  }
  return [...byUser.values()];
}

/**
 * The client's open request, if they have one. "Do I have a request in
 * flight" is the only question the account area asks — a decided deposit is
 * answered by `users.activePlanKey`, and a cancelled or refunded one is
 * history nobody is waiting on.
 *
 * At most one can exist: requestPlan() refuses a second while one is
 * undecided. Ordering is defensive, not load-bearing.
 */
export async function pendingDepositFor(userId: string): Promise<DepositRow | null> {
  const rows = await db()
    .select(DEPOSIT_ROW_COLUMNS)
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "pending")))
    .orderBy(desc(schema.deposits.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Everything that has already been decided, newest first.
 *
 * Excludes `pending` because the open request has its own card above the
 * history on the plan page, and listing it twice reads as two requests. What
 * this is for is the client who cancelled last month and wants to confirm
 * that it happened — until now the row existed and nothing showed it.
 */
export async function decidedDepositsFor(userId: string): Promise<DepositRow[]> {
  return db()
    .select(DEPOSIT_ROW_COLUMNS)
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(and(eq(schema.deposits.userId, userId), ne(schema.deposits.status, "pending")))
    .orderBy(desc(schema.deposits.createdAt));
}

export type CancelResult = "cancelled" | "not_pending";

/**
 * The client withdraws their own request. Worth having: without it, someone
 * who changes their mind leaves a row sitting in the admin queue forever, and
 * a queue full of requests nobody intends to honour is a queue people stop
 * reading.
 *
 * Scoped to `userId` in the WHERE clause, not merely checked before it — the
 * route hands us an id from the browser, so this query is what guarantees a
 * client cannot cancel somebody else's request. Guarded on `pending` for the
 * same reason confirmDeposit is: a cancel racing an admin's confirmation must
 * lose cleanly rather than un-confirm a paid plan.
 */
export async function cancelPlanRequest(
  depositId: string,
  userId: string
): Promise<CancelResult> {
  const claimed = await db()
    .update(schema.deposits)
    // reviewedBy/reviewedAt stay null on purpose: they mean "an admin decided
    // this", and nobody did. When it happened is in audit_log, which is where
    // "who did what, when" belongs anyway.
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.deposits.id, depositId),
        eq(schema.deposits.userId, userId),
        eq(schema.deposits.status, "pending")
      )
    )
    .returning({ planKey: schema.deposits.planKey });

  if (!claimed[0]) return "not_pending";

  await recordAudit(userId, "deposit.cancelled", "deposit", depositId, {
    planKey: claimed[0].planKey,
  });
  return "cancelled";
}

/**
 * Carries the affected user back to the caller, which the route needs in
 * order to tell them what happened. Previously just a string, which meant the
 * one place that knew a plan had gone live had no way to say so — the client
 * found out by logging in and looking.
 */
export type DecisionResult =
  | { status: "applied"; userId: string; planKey: string }
  /** Already decided, or never in the right state. */
  | { status: "not_applicable" };

/**
 * The moment a plan becomes real. Guarded on status = "pending" so a double
 * click, or two admins acting at once, can't confirm the same deposit twice
 * — the UPDATE claims it atomically and the second attempt matches no row.
 */
export async function confirmDeposit(depositId: string, adminId: string): Promise<DecisionResult> {
  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "confirmed", reviewedBy: adminId, reviewedAt: new Date() })
    .where(and(eq(schema.deposits.id, depositId), eq(schema.deposits.status, "pending")))
    .returning({ userId: schema.deposits.userId, planKey: schema.deposits.planKey });

  const row = claimed[0];
  if (!row) return { status: "not_applicable" };

  await db()
    .update(schema.users)
    .set({ activePlanKey: row.planKey })
    .where(eq(schema.users.id, row.userId));

  await recordAudit(adminId, "deposit.confirmed", "deposit", depositId, {
    userId: row.userId,
    planKey: row.planKey,
  });
  return { status: "applied", userId: row.userId, planKey: row.planKey };
}

export type RefundRequestResult =
  | { status: "requested"; heldCents: number; cancelledPending: boolean }
  /** Nothing is held, so there is nothing to give back. */
  | { status: "nothing_held" }
  | { status: "already_requested" };

/**
 * The client asks for their deposit back. This ends the arrangement — it is
 * the only exit, because there is no self-service downgrade.
 *
 * **Scoped to the client, not to a row.** After an upgrade there are several
 * confirmed rows and the client thinks of them as one deposit, which is also
 * the truth: the sum is what sits in our account. Every held row moves
 * together or the register stops describing reality.
 *
 * Nothing moves yet. `refund_requested` means "asked for", the plan keeps
 * working, and an admin marking it `refunded` is the moment the money and the
 * access both go.
 *
 * A pending upgrade request is cancelled in the same breath rather than
 * refused: someone asking for their money back has plainly changed their mind
 * about moving up, and leaving the older instruction alive in the admin queue
 * is how an admin ends up confirming a tier the client no longer wants.
 */
export async function requestRefund(userId: string): Promise<RefundRequestResult> {
  const ledger = await ledgerFor(userId);
  if (ledger.refundPending) return { status: "already_requested" };
  if (!ledger.hasHistory) return { status: "nothing_held" };

  const cancelled = await db()
    .update(schema.deposits)
    .set({ status: "cancelled" })
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "pending")))
    .returning({ id: schema.deposits.id });

  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "refund_requested" })
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "confirmed")))
    .returning({ id: schema.deposits.id });

  // Lost a race with an admin who refunded or confirmed in the same instant.
  if (claimed.length === 0) return { status: "nothing_held" };

  await recordAudit(userId, "deposit.refund_requested", "user", userId, {
    heldCents: ledger.heldCents,
    rows: claimed.length,
    cancelledPendingRequests: cancelled.length,
  });
  return {
    status: "requested",
    heldCents: ledger.heldCents,
    cancelledPending: cancelled.length > 0,
  };
}

/**
 * An admin sends a refund request back without paying it out — the client
 * changed their mind, usually by email.
 *
 * Not a client-facing button: the owner's spec gives the client exactly two,
 * and a third ("actually, never mind") would be a third. But without *some*
 * way back, a request made in error could only be resolved by actually
 * returning the money, which is a worse answer to a phone call.
 */
export async function declineRefundRequest(
  userId: string,
  adminId: string
): Promise<DecisionResult> {
  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "confirmed" })
    .where(
      and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "refund_requested"))
    )
    .returning({ planKey: schema.deposits.planKey });

  if (claimed.length === 0) return { status: "not_applicable" };

  await recordAudit(adminId, "deposit.refund_declined", "user", userId, {
    rows: claimed.length,
  });
  return { status: "applied", userId, planKey: claimed[0].planKey };
}

/**
 * The money goes back and the plan goes with it.
 *
 * **Client-scoped, and that is a fix rather than a refactor.** The old
 * signature took one deposit id, cleared `activePlanKey` outright, and left
 * every other confirmed row untouched. Harmless while nobody could hold two
 * rows; the moment upgrades exist it would strip the plan while still
 * reporting the older deposit as held — a client with no access and money on
 * our books. `modules/admin/model/clients.ts` carried a written warning about
 * exactly this, to be fixed "before a second plan opens up". This is that fix.
 *
 * Sessions are NOT killed here: losing a plan isn't losing the account.
 */
export async function refundClient(userId: string, adminId: string): Promise<DecisionResult> {
  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "refunded", reviewedBy: adminId, reviewedAt: new Date() })
    .where(
      and(
        eq(schema.deposits.userId, userId),
        // Both, in one statement: an admin may refund straight from the client
        // list without the client having asked, and may equally be approving a
        // request that is already sitting in the queue.
        inArray(schema.deposits.status, [...HELD_STATUSES])
      )
    )
    .returning({ planKey: schema.deposits.planKey, amountCents: schema.deposits.amountCents });

  if (claimed.length === 0) return { status: "not_applicable" };

  await db().update(schema.users).set({ activePlanKey: null }).where(eq(schema.users.id, userId));

  await recordAudit(adminId, "deposit.refunded", "user", userId, {
    rows: claimed.length,
    amountCents: claimed.reduce((sum, r) => sum + r.amountCents, 0),
  });
  // The tier they were on when it ended — what the notification email names.
  return { status: "applied", userId, planKey: claimed[claimed.length - 1].planKey };
}

export type OverrideResult =
  | { status: "applied"; userId: string; planKey: string | null; previousPlanKey: string | null }
  | { status: "not_applicable" };

/**
 * An admin sets a client's tier directly, up or down, with **no money moving**.
 *
 * The one sanctioned exception to "only confirmDeposit sets activePlanKey",
 * and it behaves like an override rather than pretending to be a purchase: it
 * writes no deposit row, because no transfer happened and inventing one would
 * put a lie in the register. It is logged with the held balance at the time,
 * and the admin screens show a warning wherever what we hold no longer covers
 * the tier — that gap is the drift that actually costs money, because the
 * broker platform's Bid Limits are set from the deposit.
 *
 * Guarded on `deletedAt is null`: an erased account holds nothing, and
 * granting one a plan would resurrect access for a person who left.
 */
export async function setPlanByAdmin(
  userId: string,
  planKey: PlanKey | null,
  adminId: string
): Promise<OverrideResult> {
  const before = await db()
    .select({ activePlanKey: schema.users.activePlanKey })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .limit(1);

  if (!before[0]) return { status: "not_applicable" };
  const previousPlanKey = before[0].activePlanKey;
  if (previousPlanKey === planKey) return { status: "not_applicable" };

  const ledger = await ledgerFor(userId);

  const claimed = await db()
    .update(schema.users)
    .set({ activePlanKey: planKey })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .returning({ id: schema.users.id });

  if (!claimed[0]) return { status: "not_applicable" };

  await recordAudit(adminId, "plan.overridden", "user", userId, {
    from: previousPlanKey,
    to: planKey,
    heldCents: ledger.heldCents,
    // Recorded at the moment of the decision, so a later change to the
    // catalogue's prices can never make a past override look reasonable — or
    // unreasonable — in hindsight.
    tierDepositCents: planKey ? PLANS[planKey].depositUsdCents : 0,
  });
  return { status: "applied", userId, planKey, previousPlanKey };
}

/** Append-only. Never let an audit failure break the action it describes —
 * a lost log line is bad; a half-applied money operation is worse. */
async function recordAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: unknown
): Promise<void> {
  try {
    await db().insert(schema.auditLog).values({ actorId, action, targetType, targetId, detail });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
