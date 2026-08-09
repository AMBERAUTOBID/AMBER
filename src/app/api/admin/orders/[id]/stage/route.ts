import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";
import { isOrderStage } from "@/modules/orders/model/stages";

/**
 * Moving a car along, and recording what happened when it moved.
 *
 * One call does both: it sets the order's `stage` column — which is what every
 * list, badge and progress bar reads — and writes or updates the timeline entry
 * for that stage. They are two statements rather than a transaction because
 * the HTTP driver has no session to hold one (see `orders.ts`), so the order
 * of writes is what keeps them coherent: the timeline entry goes FIRST.
 *
 * If the second write fails, the file has a timeline entry for a stage it has
 * not officially reached — visible, harmless, and corrected by pressing the
 * button again. The reverse order would move the car with no record of when,
 * and nothing would ever tell anyone that the date was lost.
 */
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
  const stage = body?.stage;
  if (!isOrderStage(stage)) {
    return NextResponse.json({ ok: false, error: "invalid_stage" }, { status: 400 });
  }

  const happenedAt = parseDate(body?.happenedAt) ?? new Date();
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000).trim() || null : null;
  const noteVisible = body?.noteVisibleToClient === true;
  /**
   * Whether the order's own stage moves, separate from recording the event.
   *
   * They come apart in real use: an admin adding last week's terminal photos
   * to a car that is already at sea must be able to fill in that stage without
   * sending the car backwards.
   */
  const advance = body?.advance !== false;

  // Timeline first — see the note above on why.
  await db()
    .insert(schema.orderStageEvents)
    .values({
      orderId: id,
      stage,
      happenedAt,
      note,
      noteVisibleToClient: noteVisible,
      createdBy: admin.id,
    })
    .onConflictDoUpdate({
      target: [schema.orderStageEvents.orderId, schema.orderStageEvents.stage],
      // `notifiedAt` is deliberately NOT reset here: editing a note must not
      // make the client's inbox receive the same stage twice.
      set: { happenedAt, note, noteVisibleToClient: noteVisible },
    });

  if (advance) {
    await db()
      .update(schema.vehicleOrders)
      .set({ stage, stageChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.vehicleOrders.id, id));
  }

  const events = await db()
    .select({ notifiedAt: schema.orderStageEvents.notifiedAt })
    .from(schema.orderStageEvents)
    .where(
      and(eq(schema.orderStageEvents.orderId, id), eq(schema.orderStageEvents.stage, stage))
    )
    .limit(1);

  return NextResponse.json({
    ok: true,
    stage,
    advanced: advance,
    notifiedAt: events[0]?.notifiedAt ?? null,
  });
}

/** A date the admin stated, or null — never today silently standing in. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
