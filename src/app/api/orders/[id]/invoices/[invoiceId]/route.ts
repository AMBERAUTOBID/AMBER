import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { getOrderForUser } from "@/modules/orders/model/orders";
import { getObjectStorage } from "@/modules/orders/api/storage";

/**
 * Download one issued invoice — the owner of the case file, or an admin.
 *
 * Ownership goes through `getOrderForUser`, whose WHERE clause is the check —
 * the same shape as every other client read on a case file, and for the same
 * reason: a route that fetches first and compares userId after is one
 * forgotten `if` away from serving somebody else's invoice.
 *
 * The response is a redirect to a short-lived presigned URL, named so the
 * browser saves `INV-2026-0001.pdf` and not a uuid.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; invoiceId: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { id, invoiceId } = await params;
  if (!UUID.test(id) || !UUID.test(invoiceId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const order =
    user.role === "admin"
      ? await db()
          .select({ id: schema.vehicleOrders.id })
          .from(schema.vehicleOrders)
          .where(eq(schema.vehicleOrders.id, id))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : await getOrderForUser(id, user.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const invoices = await db()
    .select()
    .from(schema.orderInvoices)
    .where(and(eq(schema.orderInvoices.id, invoiceId), eq(schema.orderInvoices.orderId, id)))
    .limit(1);
  const invoice = invoices[0];
  if (!invoice) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const storage = getObjectStorage();
  if (!storage) return NextResponse.json({ ok: false, error: "no_storage" }, { status: 503 });

  const url = await storage.presignDownload({
    key: invoice.r2Key,
    fileName: `${invoice.number}.pdf`,
    disposition: "attachment",
    expiresInSeconds: 300,
  });

  return NextResponse.redirect(url);
}
