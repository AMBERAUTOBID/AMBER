import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentUser } from "@/modules/auth/model/currentUser";
import { getObjectStorage } from "@/modules/orders/api/storage";

/** Download a container freight invoice — the container's owner or an admin.
 * Same shape as the order-invoice download; ownership sits in the WHERE. */
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

  const containers = await db()
    .select({ id: schema.containers.id, userId: schema.containers.userId })
    .from(schema.containers)
    .where(eq(schema.containers.id, id))
    .limit(1);
  const container = containers[0];
  if (!container || (user.role !== "admin" && container.userId !== user.id)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const invoices = await db()
    .select()
    .from(schema.orderInvoices)
    .where(and(eq(schema.orderInvoices.id, invoiceId), eq(schema.orderInvoices.containerId, id)))
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
