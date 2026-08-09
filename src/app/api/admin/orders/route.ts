import { NextResponse } from "next/server";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { listUsers } from "@/modules/admin/model/users";
import { getAuctionSource } from "@/modules/inventory/api";
import { buildOrderSnapshot, manualOrderSnapshot, orderTitle } from "@/modules/orders/model/orderSnapshot";
import { archivableMedia, estimateArchiveBytes, type LotMediaItem } from "@/modules/orders/model/lotMedia";
import { createOrder, findOrdersByLot } from "@/modules/orders/model/orders";
import { planAuctionMediaImport } from "@/modules/orders/api/importMedia";

/**
 * Opening a vehicle case file.
 *
 * ⚠️ **The snapshot is built from the SERVER's own fetch, never from the
 * request body.** The lookup action returns a preview so an admin can see what
 * they are about to file, but `create` ignores it entirely and asks the
 * auction again. Same rule as `deposits.amountCents` and `favorites`: a body
 * that could supply the make, model and title could file a Ferrari with a
 * clean title against somebody else's name.
 *
 * Everything here goes through `currentAdmin()` and answers 404 rather than
 * 403 — a non-admin learns nothing about what lives at this path.
 */
export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === "lookup") return lookup(body);
  if (action === "clients") return clients(body);
  if (action === "create") return create(body, admin.id);

  return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
}

/**
 * The client picker's search.
 *
 * It lives here rather than as a second action on `/api/admin/users` because
 * it exists only to serve this form, and that route's own comment is right
 * that an authenticated endpoint with no caller is surface with no upside.
 * This one has exactly one caller.
 *
 * Returns id, name and email only — enough to choose the right person and
 * nothing more. A picker does not need phone numbers or plan history on
 * screen, and what is not sent cannot leak.
 */
async function clients(body: Record<string, unknown> | null) {
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const result = await listUsers(query);
  return NextResponse.json({
    ok: true,
    clients: result.rows.slice(0, 8).map((u) => ({ id: u.id, name: u.name, email: u.email })),
    total: result.total,
  });
}

/**
 * "What is this lot, and do we already have a file on it?"
 *
 * A preview only. Nothing is written, and what comes back is deliberately not
 * trusted later — see the note above.
 */
async function lookup(body: Record<string, unknown> | null) {
  const term = typeof body?.lotOrVin === "string" ? body.lotOrVin.trim() : "";
  if (!term || term.length > 40) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  let detail;
  try {
    detail = await getAuctionSource().getVehicleDetail(term);
  } catch {
    // The vendor being down is not the same as the lot not existing, and an
    // admin who is told "not found" would file it by hand and lose the
    // photos for good.
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  }

  const snapshot = buildOrderSnapshot(detail?.data);
  if (!snapshot) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const media = archivableMedia((detail?.data?.media?.items ?? []) as LotMediaItem[]);
  const duplicates = await findOrdersByLot(snapshot.platform, snapshot.lotNumber);

  return NextResponse.json({
    ok: true,
    lot: {
      platform: snapshot.platform,
      lotNumber: snapshot.lotNumber,
      vin: snapshot.vin,
      title: orderTitle(snapshot),
      auctionName: snapshot.auctionName,
      titleClass: snapshot.titleClass,
      odometer: snapshot.odometer,
      odometerUnit: snapshot.odometerUnit,
      primaryDamage: snapshot.primaryDamage,
    },
    media: {
      photos: media.filter((m) => m.kind === "photo").length,
      videos: media.filter((m) => m.kind === "video").length,
      estimatedBytes: estimateArchiveBytes(media),
    },
    duplicates: duplicates.map((d) => ({
      reference: d.reference,
      clientName: d.clientName,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

async function create(body: Record<string, unknown> | null, adminId: string) {
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!UUID.test(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_client" }, { status: 400 });
  }

  const manual = body?.manual as Record<string, unknown> | undefined;

  // ── the manual path ─────────────────────────────────────────────────────
  // Asked for explicitly: the lot may be old, on another platform, or the car
  // bought outside an auction, and the answer must not be "the system won't
  // let me". A file created this way carries no auction media and says so.
  if (manual) {
    const platform = manual.platform === "iaai" ? "iaai" : manual.platform === "copart" ? "copart" : null;
    const lotNumber = typeof manual.lotNumber === "string" ? manual.lotNumber.trim() : "";
    if (!platform || !lotNumber) {
      return NextResponse.json({ ok: false, error: "invalid_lot" }, { status: 400 });
    }

    const duplicates = await findOrdersByLot(platform, lotNumber);
    if (duplicates.length > 0 && body?.confirmDuplicate !== true) {
      return NextResponse.json(
        { ok: false, error: "duplicate", duplicates: serialiseDuplicates(duplicates) },
        { status: 409 }
      );
    }

    const snapshot = manualOrderSnapshot({
      platform,
      lotNumber,
      vin: asString(manual.vin),
      year: asYear(manual.year),
      make: asString(manual.make),
      model: asString(manual.model),
    });
    const order = await createOrder({ userId, snapshot, createdBy: adminId });
    return NextResponse.json({ ok: true, ...order, planned: 0 });
  }

  // ── the auction path ────────────────────────────────────────────────────
  const term = typeof body?.lotOrVin === "string" ? body.lotOrVin.trim() : "";
  if (!term || term.length > 40) {
    return NextResponse.json({ ok: false, error: "invalid_lot" }, { status: 400 });
  }

  let detail;
  try {
    detail = await getAuctionSource().getVehicleDetail(term);
  } catch {
    return NextResponse.json({ ok: false, error: "upstream" }, { status: 502 });
  }

  const snapshot = buildOrderSnapshot(detail?.data);
  if (!snapshot) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const duplicates = await findOrdersByLot(snapshot.platform, snapshot.lotNumber);
  if (duplicates.length > 0 && body?.confirmDuplicate !== true) {
    // 409 with the existing files attached, rather than a refusal. Copart
    // relists unsold vehicles under the same number, so a second file is
    // sometimes right — the admin is the one who can tell.
    return NextResponse.json(
      { ok: false, error: "duplicate", duplicates: serialiseDuplicates(duplicates) },
      { status: 409 }
    );
  }

  const order = await createOrder({ userId, snapshot, createdBy: adminId });

  // Planned, not fetched. The order is usable immediately and the browser
  // drives the copy afterwards — 18 photos at ~670 KB plus a video is about
  // forty seconds of work, which no request survives.
  const plan = await planAuctionMediaImport({
    orderId: order.id,
    mediaItems: (detail?.data?.media?.items ?? []) as LotMediaItem[],
    createdBy: adminId,
  });

  return NextResponse.json({
    ok: true,
    ...order,
    planned: plan.planned,
    estimatedBytes: plan.estimatedBytes,
  });
}

function serialiseDuplicates(
  duplicates: Array<{ reference: string; clientName: string; createdAt: Date }>
) {
  return duplicates.map((d) => ({
    reference: d.reference,
    clientName: d.clientName,
    createdAt: d.createdAt.toISOString(),
  }));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A year, or null. Rejects nonsense rather than storing it. */
function asYear(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}
