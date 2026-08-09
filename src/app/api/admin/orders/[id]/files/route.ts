import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { UUID } from "@/shared/validation";
import { currentAdmin } from "@/modules/admin/model/currentAdmin";
import { getObjectStorage } from "@/modules/orders/api/storage";
import { checkUpload, orderFileKey, type OrderFileKind } from "@/modules/orders/model/fileRules";
import { isOrderStage } from "@/modules/orders/model/stages";
import { getOrder } from "@/modules/orders/model/orders";

/**
 * Files on a case file: hand out an upload link, confirm one arrived, change
 * whether the client sees it, delete it.
 *
 * The upload never passes through this server. It signs a URL and the browser
 * PUTs straight to R2 — the only way a 150 MB loading video gets past a
 * serverless request body limit, and it means a slow upload occupies nothing
 * of ours while it runs.
 *
 * ⚠️ **The storage key is computed here and never accepted from the caller.**
 * A key from the request body is a path a client controls, and the whole
 * bucket is one `../` away from being readable and writable. Everything in
 * `orderFileKey` comes from values this application generated.
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

  switch (body?.action) {
    case "presign":
      return presign(id, body, admin.id);
    case "confirm":
      return confirm(id, body);
    case "visibility":
      return visibility(id, body);
    case "delete":
      return remove(id, body);
    default:
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
}

/**
 * Signs one upload, after deciding it is allowed.
 *
 * `checkUpload` runs BEFORE the signature exists, which is the only place it
 * can run: once the URL is handed out, no code of ours executes when it is
 * used. The size and content type are then bound into the signature itself,
 * so the link cannot be redirected at a bigger or different file.
 */
async function presign(orderId: string, body: Record<string, unknown>, adminId: string) {
  const stage = body.stage;
  if (!isOrderStage(stage)) {
    return NextResponse.json({ ok: false, error: "invalid_stage" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "photo" && kind !== "video" && kind !== "document") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }

  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const sizeBytes = Number(body.sizeBytes);
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "file";

  const decision = checkUpload(kind as OrderFileKind, contentType, sizeBytes);
  if (!decision.ok) {
    // The reason travels back so the admin is told which rule stopped them.
    // "Upload failed" after waiting on a 400 MB video is the worst possible
    // feedback.
    // Spread first, then pin `ok: false` — the decision object carries its own
    // `ok`, and spreading it last would flip the answer to true.
    return NextResponse.json({ ...decision, ok: false }, { status: 400 });
  }

  const storage = getObjectStorage();
  if (!storage) return NextResponse.json({ ok: false, error: "storage_off" }, { status: 503 });

  const fileId = crypto.randomUUID();
  const key = orderFileKey(orderId, stage, fileId, decision.extension);

  // The row exists before the bytes do, with `uploadedAt` null. That is what
  // makes an abandoned upload identifiable later instead of becoming an
  // untracked object nobody can find or bill for.
  await db().insert(schema.orderFiles).values({
    id: fileId,
    orderId,
    stage,
    kind: kind as OrderFileKind,
    source: "upload",
    storageKey: key,
    fileName,
    contentType,
    sortOrder: Math.floor(Date.now() / 1000),
    uploadedBy: adminId,
  });

  const upload = await storage.presignUpload({ key, contentType, sizeBytes });
  return NextResponse.json({ ok: true, fileId, url: upload.url, expiresAt: upload.expiresAt });
}

/**
 * Marks an upload complete — but only after asking the bucket.
 *
 * The browser saying "done" is not evidence; a HEAD against the object is.
 * Without this a cancelled upload would leave a row that renders as a file and
 * serves a signed URL to nothing.
 */
async function confirm(orderId: string, body: Record<string, unknown>) {
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!UUID.test(fileId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const rows = await db()
    .select()
    .from(schema.orderFiles)
    .where(and(eq(schema.orderFiles.id, fileId), eq(schema.orderFiles.orderId, orderId)))
    .limit(1);
  const file = rows[0];
  if (!file) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const storage = getObjectStorage();
  if (!storage) return NextResponse.json({ ok: false, error: "storage_off" }, { status: 503 });

  const head = await storage.head(file.storageKey);
  if (!head) {
    return NextResponse.json({ ok: false, error: "not_uploaded" }, { status: 409 });
  }

  await db()
    .update(schema.orderFiles)
    .set({ uploadedAt: new Date(), sizeBytes: head.sizeBytes })
    .where(eq(schema.orderFiles.id, fileId));

  return NextResponse.json({ ok: true, sizeBytes: head.sizeBytes });
}

async function visibility(orderId: string, body: Record<string, unknown>) {
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!UUID.test(fileId) || typeof body.visible !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  await db()
    .update(schema.orderFiles)
    .set({ visibleToClient: body.visible })
    .where(and(eq(schema.orderFiles.id, fileId), eq(schema.orderFiles.orderId, orderId)));

  return NextResponse.json({ ok: true });
}

/**
 * Deletes the object first, then the row.
 *
 * That order is deliberate. If the object delete fails, the row survives and
 * the file is still listed — visible, and deletable again. The reverse order
 * would drop the only record of the key and leave the bytes in the bucket
 * forever, unfindable and, if it was a client's document, un-erasable.
 */
async function remove(orderId: string, body: Record<string, unknown>) {
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  if (!UUID.test(fileId)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const rows = await db()
    .select()
    .from(schema.orderFiles)
    .where(and(eq(schema.orderFiles.id, fileId), eq(schema.orderFiles.orderId, orderId)))
    .limit(1);
  const file = rows[0];
  if (!file) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const storage = getObjectStorage();
  if (storage) {
    try {
      await storage.remove(file.storageKey);
    } catch {
      return NextResponse.json({ ok: false, error: "storage_failed" }, { status: 502 });
    }
  }

  await db().delete(schema.orderFiles).where(eq(schema.orderFiles.id, fileId));
  return NextResponse.json({ ok: true });
}
