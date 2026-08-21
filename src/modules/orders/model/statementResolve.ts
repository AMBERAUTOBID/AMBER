import { eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { moneyQueueRow } from "./moneyQueue";
import type { StatementCredit } from "./statementImport";

/**
 * Turns the references a statement line carries into things an admin can act
 * on — the case file, the container, the deposit — each with enough state
 * attached to sanity-check the booking before it happens.
 *
 * Read-only on purpose. The writes stay on the endpoints that already own
 * them (`orders/[id]/money`, `containers/[id]/paid`, the deposits queue),
 * with their guards; this module only says where each euro-dollar belongs.
 */

export type StatementMatch =
  | {
      kind: "order";
      /** The reference as the bank line carried it — `INV-…` when the client
       * wrote the invoice number instead of the case reference. */
      via: string;
      orderId: string;
      reference: string;
      clientName: string;
      /** What the file still expects, in its quoted currency — the same rule
       * and the same figure as the money queue, so the two cannot disagree. */
      outstandingCents: number | null;
      currency: "USD" | "EUR";
      /**
       * A payment with this exact amount already sits on the file. The likely
       * story is that somebody booked this very statement line by hand last
       * week — said out loud, because booking it twice is the one mistake
       * this whole feature could make easier.
       */
      duplicate: boolean;
    }
  | {
      kind: "container";
      via: string;
      containerId: string;
      reference: string;
      clientName: string;
      freightCents: number;
      paid: boolean;
    }
  | {
      kind: "deposit";
      via: string;
      depositId: string;
      reference: string;
      clientName: string;
      amountCents: number;
      status: string;
    }
  | {
      /** Found in the text, found nowhere in the database — a typo'd year,
       * a reference from some other system. Shown, never dropped. */
      kind: "unknown";
      via: string;
    };

export interface ResolvedCredit extends StatementCredit {
  matches: StatementMatch[];
}

export async function resolveStatementCredits(
  credits: StatementCredit[]
): Promise<ResolvedCredit[]> {
  const orderRefs = new Set<string>();
  const containerRefs = new Set<string>();
  const invoiceNumbers = new Set<string>();
  const depositHexes = new Set<string>();

  for (const credit of credits) {
    for (const ref of credit.references) {
      if (ref.kind === "order") orderRefs.add(ref.reference);
      else if (ref.kind === "container") containerRefs.add(ref.reference);
      else if (ref.kind === "invoice") invoiceNumbers.add(ref.reference);
      else depositHexes.add(ref.reference.slice(4).toLowerCase());
    }
  }

  /**
   * An invoice number is a client writing the document's name instead of the
   * case's — resolved first, so its order or container joins the same fetch
   * as the directly-referenced ones.
   */
  const invoiceRows = invoiceNumbers.size
    ? await db()
        .select({
          number: schema.orderInvoices.number,
          orderId: schema.orderInvoices.orderId,
          containerId: schema.orderInvoices.containerId,
        })
        .from(schema.orderInvoices)
        .where(inArray(schema.orderInvoices.number, [...invoiceNumbers]))
    : [];
  const invoiceToOrder = new Map<string, string>();
  const invoiceToContainer = new Map<string, string>();
  for (const row of invoiceRows) {
    if (row.orderId) invoiceToOrder.set(row.number, row.orderId);
    else if (row.containerId) invoiceToContainer.set(row.number, row.containerId);
  }

  const [orders, containers, deposits] = await Promise.all([
    fetchOrders([...orderRefs], [...invoiceToOrder.values()]),
    fetchContainers([...containerRefs], [...invoiceToContainer.values()]),
    fetchDeposits([...depositHexes]),
  ]);

  const now = new Date();

  return credits.map((credit) => {
    const matches: StatementMatch[] = [];
    for (const ref of credit.references) {
      if (ref.kind === "order") {
        const order = orders.byReference.get(ref.reference);
        matches.push(
          order ? orderMatch(ref.reference, order, credit.amountCents, orders, now) : unknown(ref.reference)
        );
      } else if (ref.kind === "container") {
        const container = containers.byReference.get(ref.reference);
        matches.push(container ? containerMatch(ref.reference, container) : unknown(ref.reference));
      } else if (ref.kind === "invoice") {
        const orderId = invoiceToOrder.get(ref.reference);
        const containerId = invoiceToContainer.get(ref.reference);
        const order = orderId ? orders.byId.get(orderId) : undefined;
        const container = containerId ? containers.byId.get(containerId) : undefined;
        if (order) matches.push(orderMatch(ref.reference, order, credit.amountCents, orders, now));
        else if (container) matches.push(containerMatch(ref.reference, container));
        else matches.push(unknown(ref.reference));
      } else {
        const deposit = deposits.get(ref.reference.slice(4).toLowerCase());
        matches.push(
          deposit
            ? {
                kind: "deposit",
                via: ref.reference,
                depositId: deposit.id,
                reference: ref.reference,
                clientName: deposit.clientName,
                amountCents: deposit.amountCents,
                status: deposit.status,
              }
            : unknown(ref.reference)
        );
      }
    }
    return { ...credit, matches };
  });
}

const unknown = (via: string): StatementMatch => ({ kind: "unknown", via });

/* ── Orders, with the money-queue's own arithmetic ─────────────────────── */

interface OrderRow {
  id: string;
  reference: string;
  soldAt: Date | null;
  year: number | null;
  make: string | null;
  model: string | null;
  lotNumber: string;
  clientName: string;
  clientEmail: string;
  rateMicros: number | null;
}

interface OrdersLookup {
  byReference: Map<string, OrderRow>;
  byId: Map<string, OrderRow>;
  costs: Map<string, { usd: number; eur: number; lines: number }>;
  paid: Map<string, { usd: number; eur: number; count: number; amounts: Set<number> }>;
}

function orderMatch(
  via: string,
  order: OrderRow,
  creditCents: number,
  lookup: OrdersLookup,
  now: Date
): StatementMatch {
  const costs = lookup.costs.get(order.id) ?? { usd: 0, eur: 0, lines: 0 };
  const paid = lookup.paid.get(order.id) ?? { usd: 0, eur: 0, count: 0, amounts: new Set<number>() };

  const row = moneyQueueRow(
    {
      ...order,
      costUsdCents: costs.usd,
      costEurCents: costs.eur,
      costLineCount: costs.lines,
      paidUsdCents: paid.usd,
      paidEurCents: paid.eur,
      paymentCount: paid.count,
      declaredAt: null,
      lastPaymentRecordedAt: null,
    },
    now
  );

  const priced = row.status.state !== "awaiting_costs" && row.status.state !== "needs_rate";
  return {
    kind: "order",
    via,
    orderId: order.id,
    reference: order.reference,
    clientName: order.clientName,
    outstandingCents: priced ? row.status.outstandingCents : null,
    currency: row.currency,
    duplicate: paid.amounts.has(creditCents),
  };
}

async function fetchOrders(references: string[], extraIds: string[]): Promise<OrdersLookup> {
  const empty: OrdersLookup = {
    byReference: new Map(),
    byId: new Map(),
    costs: new Map(),
    paid: new Map(),
  };
  if (references.length === 0 && extraIds.length === 0) return empty;

  const conditions = [];
  if (references.length) conditions.push(inArray(schema.vehicleOrders.reference, references));
  if (extraIds.length) conditions.push(inArray(schema.vehicleOrders.id, extraIds));

  const rows = await db()
    .select({
      id: schema.vehicleOrders.id,
      reference: schema.vehicleOrders.reference,
      soldAt: schema.vehicleOrders.soldAt,
      year: schema.vehicleOrders.year,
      make: schema.vehicleOrders.make,
      model: schema.vehicleOrders.model,
      lotNumber: schema.vehicleOrders.lotNumber,
      clientName: schema.users.name,
      clientEmail: schema.users.email,
      rateMicros: schema.vehicleOrders.usdToEurMicros,
    })
    .from(schema.vehicleOrders)
    .innerJoin(schema.users, eq(schema.users.id, schema.vehicleOrders.userId))
    .where(or(...conditions));

  if (rows.length === 0) return empty;
  const ids = rows.map((r) => r.id);

  const [costRows, paymentRows] = await Promise.all([
    db()
      .select({
        orderId: schema.orderCostLines.orderId,
        amountCents: schema.orderCostLines.amountCents,
        currency: schema.orderCostLines.currency,
      })
      .from(schema.orderCostLines)
      .where(inArray(schema.orderCostLines.orderId, ids)),
    db()
      .select({
        orderId: schema.orderPayments.orderId,
        amountCents: schema.orderPayments.amountCents,
        currency: schema.orderPayments.currency,
      })
      .from(schema.orderPayments)
      .where(inArray(schema.orderPayments.orderId, ids)),
  ]);

  const lookup: OrdersLookup = { ...empty };
  for (const row of rows) {
    lookup.byReference.set(row.reference, row);
    lookup.byId.set(row.id, row);
  }
  for (const line of costRows) {
    const bucket = lookup.costs.get(line.orderId) ?? { usd: 0, eur: 0, lines: 0 };
    if (line.currency === "EUR") bucket.eur += line.amountCents;
    else bucket.usd += line.amountCents;
    bucket.lines++;
    lookup.costs.set(line.orderId, bucket);
  }
  for (const payment of paymentRows) {
    const bucket =
      lookup.paid.get(payment.orderId) ??
      { usd: 0, eur: 0, count: 0, amounts: new Set<number>() };
    if (payment.currency === "EUR") bucket.eur += payment.amountCents;
    else bucket.usd += payment.amountCents;
    bucket.count++;
    bucket.amounts.add(payment.amountCents);
    lookup.paid.set(payment.orderId, bucket);
  }
  return lookup;
}

/* ── Containers ─────────────────────────────────────────────────────────── */

interface ContainerRow {
  id: string;
  reference: string;
  freightCents: number;
  paidAt: Date | null;
  clientName: string;
}

function containerMatch(via: string, container: ContainerRow): StatementMatch {
  return {
    kind: "container",
    via,
    containerId: container.id,
    reference: container.reference,
    clientName: container.clientName,
    freightCents: container.freightCents,
    paid: container.paidAt !== null,
  };
}

async function fetchContainers(
  references: string[],
  extraIds: string[]
): Promise<{ byReference: Map<string, ContainerRow>; byId: Map<string, ContainerRow> }> {
  const result = { byReference: new Map<string, ContainerRow>(), byId: new Map<string, ContainerRow>() };
  if (references.length === 0 && extraIds.length === 0) return result;

  const conditions = [];
  if (references.length) conditions.push(inArray(schema.containers.reference, references));
  if (extraIds.length) conditions.push(inArray(schema.containers.id, extraIds));

  const rows = await db()
    .select({
      id: schema.containers.id,
      reference: schema.containers.reference,
      freightCents: schema.containers.freightCents,
      paidAt: schema.containers.paidAt,
      clientName: schema.users.name,
    })
    .from(schema.containers)
    .innerJoin(schema.users, eq(schema.users.id, schema.containers.userId))
    .where(or(...conditions));

  for (const row of rows) {
    result.byReference.set(row.reference, row);
    result.byId.set(row.id, row);
  }
  return result;
}

/* ── Deposits ───────────────────────────────────────────────────────────── */

interface DepositRow {
  id: string;
  amountCents: number;
  status: string;
  clientName: string;
}

/**
 * `DEP-A845A0AE` is the uuid's first eight hex characters (see
 * `depositReference`), which in text form are simply the id's first eight
 * characters — the first hyphen comes ninth. Matched on `left(id, 8)`.
 */
async function fetchDeposits(hexes: string[]): Promise<Map<string, DepositRow>> {
  const result = new Map<string, DepositRow>();
  if (hexes.length === 0) return result;

  const rows = await db()
    .select({
      id: schema.deposits.id,
      amountCents: schema.deposits.amountCents,
      status: schema.deposits.status,
      clientName: schema.users.name,
    })
    .from(schema.deposits)
    .innerJoin(schema.users, eq(schema.users.id, schema.deposits.userId))
    .where(
      or(...hexes.map((hex) => sql`lower(left(${schema.deposits.id}::text, 8)) = ${hex}`))
    );

  for (const row of rows) {
    result.set(row.id.slice(0, 8).toLowerCase(), row);
  }
  return result;
}
