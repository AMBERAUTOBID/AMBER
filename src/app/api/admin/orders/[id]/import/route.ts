import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getOrder } from "@/modules/orders/model/orders";
import {
  importCounts,
  importPendingMedia,
  retryFailedMedia,
} from "@/modules/orders/api/importMedia";

/**
 * Copies the next few auction files into R2, one call at a time.
 *
 * The browser is the scheduler here, and deliberately so: a lot's gallery is
 * around forty seconds of fetching and re-uploading, which no serverless
 * request survives, and a background job would fail somewhere nobody is
 * looking. Driving it from an open page means the progress is visible, the
 * failure is visible, and the retry is a button.
 *
 * Idempotent by construction — it only ever picks up rows that are still
 * pending, so a double-clicked call does the next batch rather than the same
 * one twice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  // Confirms the file exists before touching storage, so a wrong id reads as
  // "no such order" rather than "imported 0 files".
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (body?.action === "retry") {
    const cleared = await retryFailedMedia(id);
    return NextResponse.json({ ok: true, cleared, ...(await importCounts(id)) });
  }

  try {
    const progress = await importPendingMedia({ orderId: id });
    return NextResponse.json({ ok: true, ...progress });
  } catch (e) {
    // Storage being unconfigured is an operator problem, not a bad request,
    // and saying so beats a generic failure the admin cannot act on.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "import_failed" },
      { status: 500 }
    );
  }
}
