import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";
import { getObjectStorage } from "@/modules/orders/api/storage";
import { extractPdfText } from "@/modules/orders/api/pdfText";
import {
  matchesOrder,
  parseCopartReceipt,
  receiptCostLines,
  reconciles,
} from "@/modules/orders/model/copartReceipt";
import { recordAudit } from "@/shared/db/audit";

/**
 * An admin drops the Copart Sales Receipt onto a case file.
 *
 * One upload does four jobs: verifies the document belongs to THIS car
 * (lot + VIN), books the hammer and every fee as cost lines in Copart's own
 * words, archives the PDF into the file's `won` folder — it is the Bill of
 * Sale Aivi's shipping order requires — and, when the order does not yet
 * know its sale date, sets it, which is what starts the client's payment
 * clock.
 *
 * Every refusal happens before anything is written, and each carries a code
 * the panel translates:
 *
 *   wrong_platform — an IAAI car; this parser reads Copart's layout only
 *   unreadable     — no lot number found; enter the lines by hand
 *   lot / vin      — the receipt is for a DIFFERENT car. The refusal this
 *                    whole feature exists for.
 *   sum_mismatch   — parsed lines don't add up to Copart's own Net Due, so
 *                    the parser missed something; trusting it would invoice
 *                    the client wrongly
 *   already_priced — the file already has an auction_price line; importing
 *                    twice would double every fee. Delete the lines first if
 *                    the intent really is a re-import.
 */
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const order = await getOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (order.platform !== "copart") {
    return NextResponse.json({ ok: false, error: "wrong_platform" }, { status: 409 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  let text: string;
  try {
    text = await extractPdfText(bytes);
  } catch {
    return NextResponse.json({ ok: false, error: "unreadable" }, { status: 409 });
  }

  const receipt = parseCopartReceipt(text);
  const mismatch = matchesOrder(receipt, { lotNumber: order.lotNumber, vin: order.vin });
  if (mismatch) return NextResponse.json({ ok: false, error: mismatch }, { status: 409 });
  if (!reconciles(receipt)) {
    return NextResponse.json({ ok: false, error: "sum_mismatch" }, { status: 409 });
  }

  const existing = await db()
    .select({ id: schema.orderCostLines.id })
    .from(schema.orderCostLines)
    .where(
      and(eq(schema.orderCostLines.orderId, id), eq(schema.orderCostLines.kind, "auction_price"))
    )
    .limit(1);
  if (existing[0]) {
    return NextResponse.json({ ok: false, error: "already_priced" }, { status: 409 });
  }

  const lines = receiptCostLines(receipt);
  await db()
    .insert(schema.orderCostLines)
    .values(
      lines.map((line) => ({
        orderId: id,
        kind: line.kind,
        label: line.label,
        amountCents: line.amountCents,
        currency: "USD" as const,
        visibleToClient: true,
      }))
    );

  // The receipt is the Bill of Sale — it belongs in the file, not only in an
  // inbox. Archived best-effort AFTER the money landed: a bucket hiccup must
  // not roll back correct cost lines, and the panel says what happened.
  let archived = false;
  const storage = getObjectStorage();
  if (storage) {
    try {
      const key = `orders/${id}/won/receipt-${crypto.randomUUID()}.pdf`;
      await storage.put({ key, body: bytes, contentType: "application/pdf" });
      await db().insert(schema.orderFiles).values({
        orderId: id,
        stage: "won",
        kind: "document",
        source: "upload",
        storageKey: key,
        fileName: `copart-receipt-${receipt.lotNumber}.pdf`,
        contentType: "application/pdf",
        sizeBytes: bytes.length,
        uploadedAt: new Date(),
        uploadedBy: admin.id,
      });
      archived = true;
    } catch {
      archived = false;
    }
  }

  // The clock the client's whole deadline runs from. Only ever filled in,
  // never overwritten — an admin who typed a datetime knew more than a
  // date-only receipt does.
  let soldAtSet = false;
  if (!order.soldAt && receipt.saleDate) {
    await db()
      .update(schema.vehicleOrders)
      .set({ soldAt: receipt.saleDate })
      .where(eq(schema.vehicleOrders.id, id));
    soldAtSet = true;
  }

  await recordAudit(admin.id, "order.receipt_imported", "order", id, {
    lot: receipt.lotNumber,
    lines: lines.length,
    netDueCents: receipt.netDueCents,
    archived,
    soldAtSet,
  });

  return NextResponse.json({ ok: true, lines: lines.length, archived, soldAtSet });
}
