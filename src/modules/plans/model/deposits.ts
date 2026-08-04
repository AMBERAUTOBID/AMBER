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
 * 2. Confirming a deposit is the ONLY thing that sets users.activePlanKey.
 *    Requesting a plan grants nothing.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { PLANS, type PlanKey } from "./plans";

export type RequestResult =
  | { status: "requested"; depositId: string }
  /** An undecided request already exists — one open request at a time. */
  | { status: "already_pending"; depositId: string };

export async function requestPlan(userId: string, planKey: PlanKey): Promise<RequestResult> {
  const existing = await db()
    .select({ id: schema.deposits.id })
    .from(schema.deposits)
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "pending")))
    .limit(1);

  if (existing[0]) return { status: "already_pending", depositId: existing[0].id };

  const rows = await db()
    .insert(schema.deposits)
    .values({
      userId,
      planKey,
      // From the catalogue, never from the client. See rule 1 above.
      amountCents: PLANS[planKey].depositCents,
      status: "pending",
    })
    .returning({ id: schema.deposits.id });

  await recordAudit(userId, "deposit.requested", "deposit", rows[0].id, { planKey });
  return { status: "requested", depositId: rows[0].id };
}

export interface DepositRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planKey: string;
  amountCents: number;
  status: string;
  createdAt: Date;
}

/** The admin queue: undecided requests, oldest first — a queue, not a feed. */
export async function pendingDeposits(): Promise<DepositRow[]> {
  return db()
    .select({
      id: schema.deposits.id,
      userId: schema.deposits.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      planKey: schema.deposits.planKey,
      amountCents: schema.deposits.amountCents,
      status: schema.deposits.status,
      createdAt: schema.deposits.createdAt,
    })
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(eq(schema.deposits.status, "pending"))
    .orderBy(schema.deposits.createdAt);
}

export async function latestDepositFor(userId: string): Promise<DepositRow | null> {
  const rows = await db()
    .select({
      id: schema.deposits.id,
      userId: schema.deposits.userId,
      userEmail: schema.users.email,
      userName: schema.users.name,
      planKey: schema.deposits.planKey,
      amountCents: schema.deposits.amountCents,
      status: schema.deposits.status,
      createdAt: schema.deposits.createdAt,
    })
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(eq(schema.deposits.userId, userId))
    .orderBy(desc(schema.deposits.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export type ConfirmResult = "confirmed" | "not_pending";

/**
 * The moment a plan becomes real. Guarded on status = "pending" so a double
 * click, or two admins acting at once, can't confirm the same deposit twice
 * — the UPDATE claims it atomically and the second attempt matches no row.
 */
export async function confirmDeposit(depositId: string, adminId: string): Promise<ConfirmResult> {
  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "confirmed", reviewedBy: adminId, reviewedAt: new Date() })
    .where(and(eq(schema.deposits.id, depositId), eq(schema.deposits.status, "pending")))
    .returning({ userId: schema.deposits.userId, planKey: schema.deposits.planKey });

  const row = claimed[0];
  if (!row) return "not_pending";

  await db()
    .update(schema.users)
    .set({ activePlanKey: row.planKey })
    .where(eq(schema.users.id, row.userId));

  await recordAudit(adminId, "deposit.confirmed", "deposit", depositId, {
    userId: row.userId,
    planKey: row.planKey,
  });
  return "confirmed";
}

/** Marks a deposit refunded and removes the plan it was paying for. Sessions
 * are NOT killed here: losing a plan isn't losing the account. */
export async function refundDeposit(depositId: string, adminId: string): Promise<ConfirmResult> {
  const claimed = await db()
    .update(schema.deposits)
    .set({ status: "refunded", reviewedBy: adminId, reviewedAt: new Date() })
    .where(and(eq(schema.deposits.id, depositId), eq(schema.deposits.status, "confirmed")))
    .returning({ userId: schema.deposits.userId });

  const row = claimed[0];
  if (!row) return "not_pending";

  await db()
    .update(schema.users)
    .set({ activePlanKey: null })
    .where(eq(schema.users.id, row.userId));

  await recordAudit(adminId, "deposit.refunded", "deposit", depositId, { userId: row.userId });
  return "confirmed";
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
