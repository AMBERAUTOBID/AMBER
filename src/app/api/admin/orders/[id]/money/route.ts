import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";

/**
 * Cost lines, payments, and the rate that reconciles them.
 *
 * ⚠️ **Amounts arrive as CENTS, already parsed.** The form does the reading of
 * `1.420,50` because that is where the user can be shown what was understood;
 * this route accepts only an integer and rejects anything else. Parsing a
 * locale-shaped string on the server, out of sight of the person who typed it,
 * is how a comma becomes a factor of a hundred with nobody to notice.
 */
const COST_KINDS = [
  "auction_price",
  "auction_fees",
  "inland_transport",
  "terminal",
  "ocean_freight",
  "customs",
  "delivery",
  "commission",
  "other",
] as const;

const METHODS = ["bank_transfer", "cash", "other"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const order = await getOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  switch (body?.action) {
    case "addCost":
      return addCost(id, body, admin.id);
    case "deleteCost":
      return deleteRow(schema.orderCostLines, id, body);
    case "addPayment":
      return addPayment(id, body, admin.id);
    case "deletePayment":
      return deleteRow(schema.orderPayments, id, body);
    case "setRate":
      return setRate(id, body);
    default:
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
}

/** An integer number of minor units, or null. Rejects floats outright. */
function cents(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 && n < 1_000_000_000 ? n : null;
}

function currency(value: unknown): "USD" | "EUR" | null {
  return value === "USD" || value === "EUR" ? value : null;
}

async function addCost(orderId: string, body: Record<string, unknown>, adminId: string) {
  const kind = COST_KINDS.find((k) => k === body.kind);
  const amountCents = cents(body.amountCents);
  const cur = currency(body.currency);
  if (!kind || amountCents === null || !cur) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Appended to the end of the list. Ordering by insertion is what an operator
  // expects from a form that adds one line at a time, and it keeps the client's
  // table in the order the costs were explained to them.
  const next = await db()
    .select({ max: sql<number>`coalesce(max(${schema.orderCostLines.sortOrder}), -1)` })
    .from(schema.orderCostLines)
    .where(eq(schema.orderCostLines.orderId, orderId));

  await db().insert(schema.orderCostLines).values({
    orderId,
    kind,
    label: typeof body.label === "string" ? body.label.slice(0, 120).trim() || null : null,
    amountCents,
    currency: cur,
    sortOrder: Number(next[0]?.max ?? -1) + 1,
    // Costs default visible: the client is meant to see what they are paying
    // for, and a line kept from them is the exception that has to be chosen.
    visibleToClient: body.visibleToClient !== false,
    createdBy: adminId,
  });

  return NextResponse.json({ ok: true });
}

async function addPayment(orderId: string, body: Record<string, unknown>, adminId: string) {
  const amountCents = cents(body.amountCents);
  const cur = currency(body.currency);
  const method = METHODS.find((m) => m === body.method) ?? "bank_transfer";
  const paidAt = typeof body.paidAt === "string" ? new Date(body.paidAt) : null;

  if (amountCents === null || !cur || !paidAt || Number.isNaN(paidAt.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  await db().insert(schema.orderPayments).values({
    orderId,
    amountCents,
    currency: cur,
    paidAt,
    method,
    reference: typeof body.reference === "string" ? body.reference.slice(0, 120).trim() || null : null,
    note: typeof body.note === "string" ? body.note.slice(0, 500).trim() || null : null,
    visibleToClient: body.visibleToClient !== false,
    createdBy: adminId,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Deletes one row, scoped to its order.
 *
 * The `orderId` in the WHERE clause is not decoration: without it, a row id
 * from one case file would delete a line on another. Ids are opaque, but they
 * are also guessable-by-enumeration in a way an admin session should not be
 * able to exploit by accident.
 */
async function deleteRow(
  table: typeof schema.orderCostLines | typeof schema.orderPayments,
  orderId: string,
  body: Record<string, unknown>
) {
  const rowId = typeof body.rowId === "string" ? body.rowId : "";
  if (!UUID.test(rowId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  await db().delete(table).where(and(eq(table.id, rowId), eq(table.orderId, orderId)));
  return NextResponse.json({ ok: true });
}

/**
 * Fixes the USD→EUR rate on the file.
 *
 * Once set, every euro figure the client has seen depends on it, so changing
 * it later silently restates their balance. It is allowed — a typo has to be
 * fixable — but `rateSetAt` moves with it, and that date is printed under the
 * totals so the client can see which rate produced the numbers in front of
 * them.
 */
async function setRate(orderId: string, body: Record<string, unknown>) {
  const micros = body.usdToEurMicros;
  const n = typeof micros === "number" ? micros : Number(micros);
  // 0.1–10, matching the parser's bound. Outside that it is a misplaced
  // decimal, and accepting it would restate every euro figure tenfold.
  if (!Number.isInteger(n) || n < 100_000 || n > 10_000_000) {
    return NextResponse.json({ ok: false, error: "invalid_rate" }, { status: 400 });
  }

  await db()
    .update(schema.vehicleOrders)
    .set({ usdToEurMicros: n, rateSetAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.vehicleOrders.id, orderId));

  return NextResponse.json({ ok: true });
}
