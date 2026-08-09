import { and, asc, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { bumpReference, nextReference } from "./reference";
import { INITIAL_STAGE, type OrderSnapshot } from "./orderSnapshot";
import type { OrderStage } from "./stages";

/**
 * Creating and reading case files.
 *
 * ⚠️ **There are no interactive transactions here, and that is forced.** The
 * app runs on Neon's HTTP driver (`shared/db/client.ts`), which speaks SQL over
 * fetch() and therefore has no session to hold a transaction open across
 * round trips. Every multi-statement write in this codebase is already
 * sequential and guarded — `deleteAccount()` claims its row atomically with a
 * conditional UPDATE rather than wrapping the scrub in BEGIN. The same
 * discipline applies below: each statement is written so that stopping after
 * it leaves something coherent.
 */

export interface CreateOrderInput {
  userId: string;
  snapshot: OrderSnapshot;
  /** The admin doing it. Null only if the session somehow lacks an id. */
  createdBy: string | null;
  /** The date the client won it. Defaults to the auction's own sale date. */
  wonAt?: Date | null;
}

export interface CreatedOrder {
  id: string;
  reference: string;
}

/** How many references to try before giving up. */
const REFERENCE_ATTEMPTS = 6;

/**
 * Opens a case file.
 *
 * The id is generated HERE rather than by `defaultRandom()`, which is what
 * lets the first timeline event be written without first reading back what
 * the database chose. One less round trip, and no window in which an order
 * exists whose id nothing else knows.
 *
 * **Order of writes matters.** The order row goes first, and its `stage`
 * column — `won`, by default — is what search, lists and the client page all
 * read. The timeline event is history. If the second write fails, the file
 * exists and works; it is missing one line of its timeline, which
 * `ensureStageEvent()` repairs. The reverse order would leave an orphan event
 * pointing at nothing.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const { snapshot } = input;
  const id = crypto.randomUUID();
  const year = new Date().getUTCFullYear();

  let reference = nextReference(await latestReferenceForYear(year), year);

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      await db()
        .insert(schema.vehicleOrders)
        .values({
          id,
          reference,
          userId: input.userId,
          platform: snapshot.platform,
          auctionName: snapshot.auctionName,
          lotNumber: snapshot.lotNumber,
          vin: snapshot.vin,
          year: snapshot.year,
          make: snapshot.make,
          model: snapshot.model,
          color: snapshot.color,
          odometer: snapshot.odometer,
          odometerUnit: snapshot.odometerUnit,
          primaryDamage: snapshot.primaryDamage,
          secondaryDamage: snapshot.secondaryDamage,
          titleClass: snapshot.titleClass,
          docType: snapshot.docType,
          hasKeys: snapshot.hasKeys,
          soldAt: snapshot.soldAt,
          lotSnapshot: snapshot.lotSnapshot ?? null,
          stage: INITIAL_STAGE,
          createdBy: input.createdBy,
        });
      break;
    } catch (e) {
      // Two admins creating in the same second read the same latest reference
      // and compute the same next one; one loses on the unique index. That is
      // a retry, not an error anyone should see. Deriving the next attempt
      // from the reference that FAILED is what makes this converge — a fresh
      // read can return the same stale answer twice.
      if (!isUniqueViolation(e) || attempt === REFERENCE_ATTEMPTS - 1) throw e;
      reference = bumpReference(reference);
    }
  }

  // Best-effort, and deliberately so: the file is already usable without it.
  await ensureStageEvent({
    orderId: id,
    stage: INITIAL_STAGE,
    happenedAt: input.wonAt ?? snapshot.soldAt ?? new Date(),
    createdBy: input.createdBy,
  });

  return { id, reference };
}

/**
 * Writes a stage's timeline entry, or leaves the existing one alone.
 *
 * `onConflictDoNothing` on the (order, stage) unique index, so this is safe to
 * call again after a half-failed creation and safe to call when re-entering a
 * stage. It never overwrites: a date an admin corrected by hand must not be
 * silently replaced by the auction's.
 */
export async function ensureStageEvent(input: {
  orderId: string;
  stage: OrderStage;
  happenedAt: Date;
  createdBy: string | null;
}): Promise<void> {
  await db()
    .insert(schema.orderStageEvents)
    .values({
      orderId: input.orderId,
      stage: input.stage,
      happenedAt: input.happenedAt,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing();
}

/**
 * The highest reference issued in a year, or null.
 *
 * ⚠️ **`max(reference)` would be wrong.** These are text, so `'SAB-2026-9999'`
 * sorts ABOVE `'SAB-2026-10000'` — the moment a year passes 9,999 files the
 * next reference would collide forever. Ordering by length first puts the
 * wider string on top, which is the correct numeric answer for zero-padded
 * digits of mixed width.
 */
async function latestReferenceForYear(year: number): Promise<string | null> {
  const rows = await db()
    .select({ reference: schema.vehicleOrders.reference })
    .from(schema.vehicleOrders)
    .where(like(schema.vehicleOrders.reference, `SAB-${year}-%`))
    .orderBy(
      desc(sql`length(${schema.vehicleOrders.reference})`),
      desc(schema.vehicleOrders.reference)
    )
    .limit(1);
  return rows[0]?.reference ?? null;
}

export interface OrderListRow {
  id: string;
  reference: string;
  stage: OrderStage;
  year: number | null;
  make: string | null;
  model: string | null;
  lotNumber: string;
  vin: string | null;
  clientName: string;
  clientEmail: string;
  createdAt: Date;
}

/** Hard cap, same reasoning as `USERS_PAGE_SIZE`: bounded beats "select all
 * and let the browser cope", which is free at ten files and a slow mistake at
 * ten thousand. */
export const ORDERS_PAGE_SIZE = 50;

/**
 * Every case file, newest first, with who it belongs to.
 *
 * `stage` is typed rather than a loose string on purpose: the column's enum is
 * a TypeScript constraint on `text` and Postgres never saw a CHECK, so an
 * unvalidated query parameter would reach the WHERE clause intact and filter
 * to nothing with no explanation. Callers parse with `parseStage()` first.
 */
export async function listOrders(stage?: OrderStage): Promise<OrderListRow[]> {
  const rows = await db()
    .select({
      id: schema.vehicleOrders.id,
      reference: schema.vehicleOrders.reference,
      stage: schema.vehicleOrders.stage,
      year: schema.vehicleOrders.year,
      make: schema.vehicleOrders.make,
      model: schema.vehicleOrders.model,
      lotNumber: schema.vehicleOrders.lotNumber,
      vin: schema.vehicleOrders.vin,
      clientName: schema.users.name,
      clientEmail: schema.users.email,
      createdAt: schema.vehicleOrders.createdAt,
    })
    .from(schema.vehicleOrders)
    .innerJoin(schema.users, eq(schema.users.id, schema.vehicleOrders.userId))
    .where(stage ? eq(schema.vehicleOrders.stage, stage) : undefined)
    .orderBy(desc(schema.vehicleOrders.createdAt))
    .limit(ORDERS_PAGE_SIZE);
  return rows;
}

/**
 * Files already open on this lot.
 *
 * The (platform, lot_number) index is deliberately NOT unique — Copart relists
 * unsold vehicles under the same number, and numbers are reused over a long
 * enough period, so a second file is sometimes legitimate. This is what the
 * creation flow calls instead: it shows the admin what already exists and lets
 * them decide, rather than meeting them with a constraint violation.
 */
export async function findOrdersByLot(
  platform: "copart" | "iaai",
  lotNumber: string
): Promise<Array<{ id: string; reference: string; clientName: string; createdAt: Date }>> {
  return db()
    .select({
      id: schema.vehicleOrders.id,
      reference: schema.vehicleOrders.reference,
      clientName: schema.users.name,
      createdAt: schema.vehicleOrders.createdAt,
    })
    .from(schema.vehicleOrders)
    .innerJoin(schema.users, eq(schema.users.id, schema.vehicleOrders.userId))
    .where(
      and(
        eq(schema.vehicleOrders.platform, platform),
        eq(schema.vehicleOrders.lotNumber, lotNumber)
      )
    )
    .orderBy(desc(schema.vehicleOrders.createdAt));
}

/** One case file, for an admin — no visibility filtering. */
export async function getOrder(id: string) {
  const rows = await db()
    .select()
    .from(schema.vehicleOrders)
    .where(eq(schema.vehicleOrders.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * One case file, for the client who owns it.
 *
 * The ownership check is part of the QUERY, not something the caller is
 * trusted to have done. A `getOrder(id)` followed by an `if` in a page is one
 * forgotten `if` away from serving somebody else's documents, and that is
 * exactly the mistake this shape makes impossible.
 */
export async function getOrderForUser(id: string, userId: string) {
  const rows = await db()
    .select()
    .from(schema.vehicleOrders)
    .where(and(eq(schema.vehicleOrders.id, id), eq(schema.vehicleOrders.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** A client's own files, newest first. */
export async function listOrdersForUser(userId: string) {
  return db()
    .select({
      id: schema.vehicleOrders.id,
      reference: schema.vehicleOrders.reference,
      stage: schema.vehicleOrders.stage,
      year: schema.vehicleOrders.year,
      make: schema.vehicleOrders.make,
      model: schema.vehicleOrders.model,
      createdAt: schema.vehicleOrders.createdAt,
    })
    .from(schema.vehicleOrders)
    .where(eq(schema.vehicleOrders.userId, userId))
    .orderBy(desc(schema.vehicleOrders.createdAt))
    .limit(ORDERS_PAGE_SIZE);
}

/** Every file on an order, oldest stage first. */
export async function listOrderFiles(orderId: string) {
  return db()
    .select()
    .from(schema.orderFiles)
    .where(eq(schema.orderFiles.orderId, orderId))
    .orderBy(asc(schema.orderFiles.sortOrder));
}

/** The timeline, oldest first. */
export async function listStageEvents(orderId: string) {
  return db()
    .select()
    .from(schema.orderStageEvents)
    .where(eq(schema.orderStageEvents.orderId, orderId))
    .orderBy(asc(schema.orderStageEvents.happenedAt));
}

/**
 * Cost lines and payments.
 *
 * `visibleOnly` is a QUERY parameter rather than something the caller filters
 * afterwards, for the same reason `getOrderForUser` embeds its ownership
 * check: a page that fetched everything and filtered in JSX is one careless
 * map away from printing an internal line to the client. What the client's
 * page asks for is what the client may see.
 */
export async function listCostLines(orderId: string, visibleOnly = false) {
  return db()
    .select()
    .from(schema.orderCostLines)
    .where(
      visibleOnly
        ? and(
            eq(schema.orderCostLines.orderId, orderId),
            eq(schema.orderCostLines.visibleToClient, true)
          )
        : eq(schema.orderCostLines.orderId, orderId)
    )
    .orderBy(asc(schema.orderCostLines.sortOrder));
}

export async function listPayments(orderId: string, visibleOnly = false) {
  return db()
    .select()
    .from(schema.orderPayments)
    .where(
      visibleOnly
        ? and(
            eq(schema.orderPayments.orderId, orderId),
            eq(schema.orderPayments.visibleToClient, true)
          )
        : eq(schema.orderPayments.orderId, orderId)
    )
    .orderBy(asc(schema.orderPayments.paidAt));
}

/** Files, optionally only the ones a client may see. */
export async function listVisibleOrderFiles(orderId: string) {
  return db()
    .select()
    .from(schema.orderFiles)
    .where(
      and(
        eq(schema.orderFiles.orderId, orderId),
        eq(schema.orderFiles.visibleToClient, true),
        isNotNull(schema.orderFiles.uploadedAt)
      )
    )
    .orderBy(asc(schema.orderFiles.sortOrder));
}

/** The timeline a client sees: every stage entry, but notes only when published. */
export async function listVisibleStageEvents(orderId: string) {
  const rows = await listStageEvents(orderId);
  return rows.map((row) => ({
    ...row,
    // Blanked rather than omitted: the stage still happened on that date, and
    // hiding the row entirely would leave a gap in the client's timeline.
    note: row.noteVisibleToClient ? row.note : null,
  }));
}

/**
 * How the auction import stands: planned, done, still to do, given up on.
 *
 * `total` counts auction rows only. Files an admin uploaded are not part of
 * an import and must not make its progress bar look incomplete forever.
 */
export async function auctionImportSummary(
  orderId: string
): Promise<{ total: number; uploaded: number; remaining: number; failed: number }> {
  const rows = await db()
    .select({
      total: sql<number>`count(*)`,
      uploaded: sql<number>`count(*) filter (where ${schema.orderFiles.uploadedAt} is not null)`,
      failed: sql<number>`count(*) filter (where ${schema.orderFiles.importError} is not null)`,
    })
    .from(schema.orderFiles)
    .where(
      and(eq(schema.orderFiles.orderId, orderId), eq(schema.orderFiles.source, "auction"))
    );

  const total = Number(rows[0]?.total ?? 0);
  const uploaded = Number(rows[0]?.uploaded ?? 0);
  const failed = Number(rows[0]?.failed ?? 0);
  return { total, uploaded, failed, remaining: total - uploaded - failed };
}

/**
 * Postgres' unique-violation code, 23505.
 *
 * Checked by code rather than by message text: the message is localised and
 * reworded between versions, and a string match that silently stops matching
 * would turn a retryable collision into a failed creation with a stack trace
 * in front of an admin.
 */
function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}
