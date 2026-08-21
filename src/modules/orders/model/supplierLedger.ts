import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { orderMoney } from "./money";
import { listCostLines, listPayments } from "./orders";
import {
  drawdownNeedsOverride,
  supplierBalanceCents,
  type SupplierLedgerRow,
} from "./supplierBalance";

/**
 * The DB half of the supplier ledger. Rules live in `supplierBalance.ts`;
 * this file moves rows and answers the one question that needs other
 * tables: "has this order's client actually settled?"
 */

export interface SupplierEntryView {
  id: string;
  kind: "top_up" | "drawdown" | "adjustment";
  direction: "credit" | "debit";
  amountCents: number;
  orderReference: string | null;
  note: string | null;
  overrideReason: string | null;
  occurredAt: Date;
}

export interface SupplierLedgerView {
  balanceCents: number;
  entries: SupplierEntryView[];
  /** Most recent drawdown amounts, newest first — the runway sample. */
  recentDrawdownsCents: number[];
}

const LEDGER_LIMIT = 200;

export async function supplierLedgerView(): Promise<SupplierLedgerView> {
  // The balance must come from EVERY row, not from the page the admin can
  // see — a ledger whose displayed total drifts from its true total the day
  // row 201 exists is the exact lie this table exists to prevent.
  const all = await db()
    .select({
      kind: schema.supplierLedger.kind,
      direction: schema.supplierLedger.direction,
      amountCents: schema.supplierLedger.amountCents,
    })
    .from(schema.supplierLedger);
  const balanceCents = supplierBalanceCents(all as SupplierLedgerRow[]);

  const rows = await db()
    .select({
      id: schema.supplierLedger.id,
      kind: schema.supplierLedger.kind,
      direction: schema.supplierLedger.direction,
      amountCents: schema.supplierLedger.amountCents,
      note: schema.supplierLedger.note,
      overrideReason: schema.supplierLedger.overrideReason,
      occurredAt: schema.supplierLedger.occurredAt,
      orderReference: schema.vehicleOrders.reference,
    })
    .from(schema.supplierLedger)
    .leftJoin(schema.vehicleOrders, eq(schema.supplierLedger.orderId, schema.vehicleOrders.id))
    .orderBy(desc(schema.supplierLedger.occurredAt), desc(schema.supplierLedger.createdAt))
    .limit(LEDGER_LIMIT);

  return {
    balanceCents,
    entries: rows,
    recentDrawdownsCents: rows
      .filter((r) => r.kind === "drawdown")
      .map((r) => r.amountCents),
  };
}

/**
 * The doctrine's four facts for one case file, by its REFERENCE.
 *
 * Extracted so the supplier ledger's guard and the admin page's verdict
 * badge read the SAME computation — a badge that says "clear to pay" while
 * the ledger refuses would be two rules wearing one name.
 */
export interface OrderDrawdownFacts {
  orderId: string;
  clientSettled: boolean;
  repeatClient: boolean;
  invoiceIssued: boolean;
  paymentDeclared: boolean;
}

export async function drawdownFactsFor(reference: string): Promise<OrderDrawdownFacts | null> {
  const ref = reference.trim().toUpperCase();
  const orders = await db()
    .select({
      id: schema.vehicleOrders.id,
      userId: schema.vehicleOrders.userId,
      rate: schema.vehicleOrders.usdToEurMicros,
    })
    .from(schema.vehicleOrders)
    .where(eq(schema.vehicleOrders.reference, ref))
    .limit(1);
  if (!orders[0]) return null;
  const orderId = orders[0].id;

  const [costs, payments, priorOrders, invoices, declarations] = await Promise.all([
    listCostLines(orderId),
    listPayments(orderId),
    db()
      .select({ id: schema.vehicleOrders.id })
      .from(schema.vehicleOrders)
      .where(
        and(eq(schema.vehicleOrders.userId, orders[0].userId), ne(schema.vehicleOrders.id, orderId))
      )
      .limit(1),
    db()
      .select({ id: schema.orderInvoices.id })
      .from(schema.orderInvoices)
      .where(eq(schema.orderInvoices.orderId, orderId))
      .limit(1),
    db()
      .select({ id: schema.activityEvents.id })
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.kind, "order.payment_declared"),
          eq(schema.activityEvents.subjectKey, `order:${ref}`)
        )
      )
      .limit(1),
  ]);

  return {
    orderId,
    clientSettled: orderMoney(costs, payments, orders[0].rate).settled,
    repeatClient: priorOrders.length > 0,
    invoiceIssued: invoices.length > 0,
    paymentDeclared: declarations.length > 0,
  };
}

export type AddEntryResult =
  | { status: "ok"; id: string }
  | { status: "needs_override" }
  | { status: "order_not_found" };

/**
 * Record one movement. The guard runs HERE, server-side: a drawdown against
 * an order whose client has not settled — or against no order at all — is
 * refused unless an override reason arrives with it. The UI asks first to
 * be polite; this is what makes the rule real.
 */
export async function addSupplierEntry(input: {
  kind: "top_up" | "drawdown" | "adjustment";
  amountCents: number;
  /** `credit`/`debit` for adjustments; derived from kind otherwise. */
  direction?: "credit" | "debit";
  /** The human key — `SAB-2026-0007` — because that is what an admin holds. */
  orderReference?: string | null;
  note?: string | null;
  overrideReason?: string | null;
  occurredAt: Date;
  createdBy: string;
}): Promise<AddEntryResult> {
  let orderId: string | null = null;
  let facts: OrderDrawdownFacts | null = null;

  if (input.orderReference) {
    facts = await drawdownFactsFor(input.orderReference);
    if (!facts) return { status: "order_not_found" };
    orderId = facts.orderId;
  }

  const needsOverride = drawdownNeedsOverride({
    kind: input.kind,
    clientSettled: facts?.clientSettled ?? null,
    repeatClient: facts?.repeatClient ?? false,
    invoiceIssued: facts?.invoiceIssued ?? false,
    paymentDeclared: facts?.paymentDeclared ?? false,
  });
  const overrideReason = input.overrideReason?.trim() || null;
  if (needsOverride && !overrideReason) return { status: "needs_override" };

  const direction: "credit" | "debit" =
    input.kind === "top_up"
      ? "credit"
      : input.kind === "drawdown"
        ? "debit"
        : (input.direction ?? "debit");

  const inserted = await db()
    .insert(schema.supplierLedger)
    .values({
      kind: input.kind,
      amountCents: Math.abs(input.amountCents),
      direction,
      orderId,
      note: input.note?.trim() || null,
      // Stored only when it was actually needed — a reason typed onto a
      // settled car's drawdown would read as financing that never happened.
      overrideReason: needsOverride ? overrideReason : null,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
    })
    .returning({ id: schema.supplierLedger.id });

  return { status: "ok", id: inserted[0].id };
}
