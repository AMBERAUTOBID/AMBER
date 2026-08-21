import { and, asc, desc, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import type { ContainerQueueInput } from "./moneyQueue";

/**
 * Dedicated containers — creation, linking, and the questions pages ask.
 *
 * The reference follows the case-file discipline exactly: `CNT-2026-0001`,
 * year-scoped, zero-padded, the database's unique index as the real arbiter.
 * It is what the client types into their bank's reference field for the
 * freight transfer, so it obeys the same "readable down a phone" rule.
 */

const PREFIX = "CNT";
const PAD = 4;

export function formatContainerReference(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(PAD, "0")}`;
}

export function nextContainerReference(latest: string | null, year: number): string {
  const match = latest?.trim().toUpperCase().match(/^CNT-(\d{4})-(\d+)$/);
  const sequence = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1;
  return formatContainerReference(year, sequence);
}

export interface ContainerCar {
  id: string;
  reference: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  lotNumber: string;
}

export interface ContainerView {
  id: string;
  reference: string;
  containerType: string;
  freightCents: number;
  dueAt: Date;
  paidAt: Date | null;
  note: string | null;
  cars: ContainerCar[];
  invoices: { id: string; number: string; issuedAt: Date }[];
}

export async function containerView(containerId: string): Promise<ContainerView | null> {
  const rows = await db()
    .select()
    .from(schema.containers)
    .where(eq(schema.containers.id, containerId))
    .limit(1);
  const container = rows[0];
  if (!container) return null;

  const [cars, invoices] = await Promise.all([
    db()
      .select({
        id: schema.vehicleOrders.id,
        reference: schema.vehicleOrders.reference,
        year: schema.vehicleOrders.year,
        make: schema.vehicleOrders.make,
        model: schema.vehicleOrders.model,
        vin: schema.vehicleOrders.vin,
        lotNumber: schema.vehicleOrders.lotNumber,
      })
      .from(schema.vehicleOrders)
      .where(eq(schema.vehicleOrders.containerId, containerId))
      .orderBy(schema.vehicleOrders.reference),
    db()
      .select({
        id: schema.orderInvoices.id,
        number: schema.orderInvoices.number,
        issuedAt: schema.orderInvoices.issuedAt,
      })
      .from(schema.orderInvoices)
      .where(eq(schema.orderInvoices.containerId, containerId))
      .orderBy(desc(schema.orderInvoices.issuedAt)),
  ]);

  return {
    id: container.id,
    reference: container.reference,
    containerType: container.containerType,
    freightCents: container.freightCents,
    dueAt: container.dueAt,
    paidAt: container.paidAt,
    note: container.note,
    cars,
    invoices,
  };
}

/** The same client's case files that could still join a container. */
export async function linkableOrdersFor(userId: string) {
  return db()
    .select({
      id: schema.vehicleOrders.id,
      reference: schema.vehicleOrders.reference,
      year: schema.vehicleOrders.year,
      make: schema.vehicleOrders.make,
      model: schema.vehicleOrders.model,
    })
    .from(schema.vehicleOrders)
    .where(and(eq(schema.vehicleOrders.userId, userId), isNull(schema.vehicleOrders.containerId)))
    .orderBy(desc(schema.vehicleOrders.createdAt));
}

export type CreateContainerResult =
  | { status: "ok"; id: string; reference: string }
  | { status: "mixed_owners" }
  | { status: "no_orders" };

/**
 * Create the container and claim its cars, atomically enough.
 *
 * All orders must belong to ONE client — a container invoiced to one person
 * but carrying another's car is a dispute pre-assembled. Orders already in
 * a container are silently skipped rather than stolen: re-linking a car is
 * an explicit unlink-first operation nobody has needed yet.
 */
export async function createContainer(input: {
  orderIds: string[];
  freightCents: number;
  dueAt: Date;
  containerType: string;
  note: string | null;
  createdBy: string;
}): Promise<CreateContainerResult> {
  if (input.orderIds.length === 0) return { status: "no_orders" };

  const orders = await db()
    .select({
      id: schema.vehicleOrders.id,
      userId: schema.vehicleOrders.userId,
      containerId: schema.vehicleOrders.containerId,
    })
    .from(schema.vehicleOrders)
    .where(inArray(schema.vehicleOrders.id, input.orderIds));

  const mine = orders.filter((o) => o.containerId === null);
  if (mine.length === 0) return { status: "no_orders" };

  const owners = new Set(mine.map((o) => o.userId));
  if (owners.size > 1) return { status: "mixed_owners" };
  const userId = mine[0].userId;

  const year = new Date().getUTCFullYear();
  const latest = await db()
    .select({ reference: schema.containers.reference })
    .from(schema.containers)
    .where(like(schema.containers.reference, `CNT-${year}-%`))
    .orderBy(desc(schema.containers.reference))
    .limit(1);

  let reference = nextContainerReference(latest[0]?.reference ?? null, year);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const inserted = await db()
        .insert(schema.containers)
        .values({
          reference,
          userId,
          containerType: input.containerType,
          freightCents: Math.abs(input.freightCents),
          dueAt: input.dueAt,
          note: input.note,
          createdBy: input.createdBy,
        })
        .returning({ id: schema.containers.id });

      for (const order of mine) {
        await db()
          .update(schema.vehicleOrders)
          .set({ containerId: inserted[0].id })
          .where(eq(schema.vehicleOrders.id, order.id));
      }
      return { status: "ok", id: inserted[0].id, reference };
    } catch (e) {
      if (!(e instanceof Error && /unique|duplicate/i.test(e.message))) throw e;
      reference = nextContainerReference(reference, year);
    }
  }
  throw new Error("container reference allocation failed three times");
}

/**
 * Bounded like every list, but the bound is a formality: a container holds
 * several cars and takes weeks to fill, so hundreds of simultaneously unpaid
 * ones would mean the business has changed shape and this page is the least
 * of it. The caller is still told when it happens — the money page must never
 * silently omit a debt.
 */
export const CONTAINER_QUEUE_LIMIT = 200;

/**
 * Every unpaid dedicated container, for the admin money list.
 *
 * One query, same discipline as `listMoneyQueueRows`: the car count and the
 * link target come from a grouped subquery rather than a fetch per container.
 * `firstOrderId` is the lowest case reference's order — an arbitrary but
 * stable choice of which case file page to open, since the container panel
 * renders on every linked order.
 *
 * Ordered by deadline **ascending** so truncation could only ever drop the
 * least urgent rows, mirroring the money queue's oldest-first rule.
 */
export async function listUnpaidContainers(limit = CONTAINER_QUEUE_LIMIT): Promise<{
  rows: ContainerQueueInput[];
  truncated: boolean;
}> {
  const cars = db()
    .select({
      containerId: schema.vehicleOrders.containerId,
      count: sql<string>`count(*)`.as("car_count"),
      firstOrderId:
        sql<string>`(array_agg(${schema.vehicleOrders.id} order by ${schema.vehicleOrders.reference}))[1]`.as(
          "first_order_id"
        ),
    })
    .from(schema.vehicleOrders)
    .where(isNotNull(schema.vehicleOrders.containerId))
    .groupBy(schema.vehicleOrders.containerId)
    .as("cars");

  const invoices = db()
    .select({
      containerId: schema.orderInvoices.containerId,
      count: sql<string>`count(*)`.as("invoice_count"),
    })
    .from(schema.orderInvoices)
    .where(isNotNull(schema.orderInvoices.containerId))
    .groupBy(schema.orderInvoices.containerId)
    .as("invoices");

  const rows = await db()
    .select({
      id: schema.containers.id,
      reference: schema.containers.reference,
      containerType: schema.containers.containerType,
      freightCents: schema.containers.freightCents,
      dueAt: schema.containers.dueAt,
      paidAt: schema.containers.paidAt,
      clientName: schema.users.name,
      clientEmail: schema.users.email,
      carCount: cars.count,
      firstOrderId: cars.firstOrderId,
      invoiceCount: invoices.count,
    })
    .from(schema.containers)
    .innerJoin(schema.users, eq(schema.users.id, schema.containers.userId))
    .leftJoin(cars, eq(cars.containerId, schema.containers.id))
    .leftJoin(invoices, eq(invoices.containerId, schema.containers.id))
    .where(isNull(schema.containers.paidAt))
    .orderBy(asc(schema.containers.dueAt))
    .limit(limit + 1);

  // count() comes back as a bigint the driver hands over as a string —
  // coerced here, the same boundary rule as the money queue.
  return {
    truncated: rows.length > limit,
    rows: rows.slice(0, limit).map((row) => ({
      id: row.id,
      reference: row.reference,
      containerType: row.containerType,
      freightCents: row.freightCents,
      dueAt: row.dueAt,
      paidAt: row.paidAt,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      carCount: Number(row.carCount ?? 0),
      firstOrderId: row.firstOrderId ?? null,
      invoiceIssued: Number(row.invoiceCount ?? 0) > 0,
    })),
  };
}

export async function markContainerPaid(containerId: string): Promise<boolean> {
  const updated = await db()
    .update(schema.containers)
    .set({ paidAt: new Date() })
    .where(and(eq(schema.containers.id, containerId), isNull(schema.containers.paidAt)))
    .returning({ id: schema.containers.id });
  return updated.length > 0;
}
