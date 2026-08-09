import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { getObjectStorage } from "./storage";
import { ALLOWED_TYPES, MAX_BYTES, orderFileKey, type OrderFileKind } from "../model/fileRules";
import { archivableMedia, estimateArchiveBytes, type LotMediaItem } from "../model/lotMedia";
import { INITIAL_STAGE } from "../model/orderSnapshot";

/**
 * Copying an auction's own photos and video into the case file.
 *
 * **Why this is a copy and not a link.** Every image on the site today is a
 * direct link to `cs.copart.com` or `vis.iaai.com`. That is fine for a listing
 * that is gone in a week and wrong for a record meant to outlive delivery by
 * years: the day the auction drops the lot, the client opens their car and
 * sees empty boxes, and nobody finds out until they say so.
 *
 * **Why it is batched.** A lot carries 12–22 photos at ~670 KB each plus a
 * 5–16 MB video; fetching and re-uploading all of it takes around 40 seconds,
 * which no serverless request survives. So the work is split: the order is
 * created instantly with every file planned but empty, and the browser drives
 * the import a few files at a time with visible progress. A failure is then
 * something an admin can see and retry, rather than a copy that silently
 * stopped half way.
 */

/**
 * Files per call. Four photos is roughly 2.7 MB moved in maybe three seconds —
 * comfortably inside any request timeout, and small enough that a failure
 * costs almost nothing to retry.
 */
const DEFAULT_BATCH = 4;

/**
 * Bytes per call. A single video blows straight past this, which is why the
 * loop always processes at least one item: a budget that skipped anything too
 * large for it would leave the video permanently pending.
 */
const BATCH_BYTE_BUDGET = 8 * 1024 * 1024;

export interface ImportPlan {
  planned: number;
  estimatedBytes: number;
  /** True when auction media was already planned and nothing was added. */
  alreadyPlanned: boolean;
}

/**
 * Writes one empty `order_files` row per archivable item.
 *
 * Nothing is fetched here. The point is that after this returns, the case file
 * already knows exactly what it is owed — so the import screen can show "0 of
 * 17" rather than a spinner, and an interrupted import has somewhere to
 * resume from.
 *
 * Idempotent by existence: if the order already has auction rows, this adds
 * nothing. Re-planning would mint fresh uuids, and therefore fresh storage
 * keys, and the file would end up with two of every photo.
 */
export async function planAuctionMediaImport(input: {
  orderId: string;
  mediaItems: LotMediaItem[] | undefined;
  createdBy: string | null;
}): Promise<ImportPlan> {
  const existing = await db()
    .select({ n: sql<number>`count(*)` })
    .from(schema.orderFiles)
    .where(
      and(eq(schema.orderFiles.orderId, input.orderId), eq(schema.orderFiles.source, "auction"))
    );
  if (Number(existing[0]?.n ?? 0) > 0) {
    return { planned: 0, estimatedBytes: 0, alreadyPlanned: true };
  }

  const media = archivableMedia(input.mediaItems);
  if (media.length === 0) return { planned: 0, estimatedBytes: 0, alreadyPlanned: false };

  const rows = media.map((item) => {
    const id = crypto.randomUUID();
    const extension = ALLOWED_TYPES[item.kind][item.contentType] ?? ".bin";
    return {
      id,
      orderId: input.orderId,
      // Auction media belongs to the stage the file starts in — it is what the
      // car looked like when it was won, which is a different statement from
      // what it looked like at the terminal.
      stage: INITIAL_STAGE,
      kind: item.kind,
      source: "auction" as const,
      sourceUrl: item.url,
      storageKey: orderFileKey(input.orderId, INITIAL_STAGE, id, extension),
      // Readable in a download and in the R2 console, and stable regardless of
      // what the auction called it.
      fileName: `auction-${item.kind}-${String(item.position + 1).padStart(2, "0")}${extension}`,
      contentType: item.contentType,
      sortOrder: item.position,
      visibleToClient: true,
      uploadedBy: input.createdBy,
    };
  });

  await db().insert(schema.orderFiles).values(rows);

  return { planned: rows.length, estimatedBytes: estimateArchiveBytes(media), alreadyPlanned: false };
}

export interface ImportProgress {
  imported: number;
  failed: number;
  /** Still to do — pending rows with no recorded error. */
  remaining: number;
  /** Rows that gave up, so the screen can offer a retry instead of stalling. */
  failedTotal: number;
}

/**
 * Fetches and stores the next few planned files.
 *
 * Called repeatedly by the browser until `remaining` reaches zero. Each item
 * is independent: one dead URL records its reason and the rest carry on, which
 * is the difference between "16 of 17 photos and one to retry" and "the import
 * failed".
 */
export async function importPendingMedia(input: {
  orderId: string;
  limit?: number;
}): Promise<ImportProgress> {
  const storage = getObjectStorage();
  if (!storage) throw new Error("R2 is not configured; cannot import auction media.");

  const limit = input.limit ?? DEFAULT_BATCH;

  const pending = await db()
    .select()
    .from(schema.orderFiles)
    .where(
      and(
        eq(schema.orderFiles.orderId, input.orderId),
        eq(schema.orderFiles.source, "auction"),
        isNull(schema.orderFiles.uploadedAt),
        isNull(schema.orderFiles.importError)
      )
    )
    .orderBy(asc(schema.orderFiles.sortOrder))
    .limit(limit);

  let imported = 0;
  let failed = 0;
  let bytesThisBatch = 0;

  for (const row of pending) {
    // Always attempt the first item regardless of budget — otherwise a video
    // larger than the budget would be skipped on every call, forever.
    if (imported + failed > 0 && bytesThisBatch >= BATCH_BYTE_BUDGET) break;

    try {
      const bytes = await fetchOne(row.sourceUrl, row.kind as OrderFileKind);
      await storage.put({
        key: row.storageKey,
        body: bytes.body,
        contentType: bytes.contentType,
      });
      await db()
        .update(schema.orderFiles)
        .set({
          uploadedAt: new Date(),
          sizeBytes: bytes.body.byteLength,
          // The response header beats what we guessed at plan time.
          contentType: bytes.contentType,
        })
        .where(eq(schema.orderFiles.id, row.id));
      imported++;
      bytesThisBatch += bytes.body.byteLength;
    } catch (e) {
      failed++;
      await db()
        .update(schema.orderFiles)
        .set({ importError: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
        .where(eq(schema.orderFiles.id, row.id));
    }
  }

  return { imported, failed, ...(await importCounts(input.orderId)) };
}

/** Pending and failed totals, for the progress display. */
export async function importCounts(
  orderId: string
): Promise<{ remaining: number; failedTotal: number }> {
  const rows = await db()
    .select({
      remaining: sql<number>`count(*) filter (where ${schema.orderFiles.uploadedAt} is null and ${schema.orderFiles.importError} is null)`,
      failedTotal: sql<number>`count(*) filter (where ${schema.orderFiles.importError} is not null)`,
    })
    .from(schema.orderFiles)
    .where(
      and(eq(schema.orderFiles.orderId, orderId), eq(schema.orderFiles.source, "auction"))
    );
  return {
    remaining: Number(rows[0]?.remaining ?? 0),
    failedTotal: Number(rows[0]?.failedTotal ?? 0),
  };
}

/**
 * Clears the recorded errors so the failed files are picked up again.
 *
 * A retry rather than an automatic one: the usual cause is the auction CDN
 * being briefly unavailable, and hammering it from inside the import loop
 * would turn one slow moment into a stall.
 */
export async function retryFailedMedia(orderId: string): Promise<number> {
  const rows = await db()
    .update(schema.orderFiles)
    .set({ importError: null })
    .where(
      and(
        eq(schema.orderFiles.orderId, orderId),
        eq(schema.orderFiles.source, "auction"),
        isNull(schema.orderFiles.uploadedAt)
      )
    )
    .returning({ id: schema.orderFiles.id });
  return rows.length;
}

/**
 * One file, into memory.
 *
 * Buffered rather than streamed because R2's PUT wants a length, and because
 * the largest thing here is a 16 MB video — well inside a function's memory,
 * and not worth the complexity of a streaming upload to save.
 *
 * The size ceiling is checked against the SAME table admin uploads use, so a
 * pathological auction file cannot enter through a door the manual path
 * guards. `content-length` is trusted only as a first refusal; the real check
 * is on what actually arrived, because a header can lie and a truncated
 * response cannot.
 */
async function fetchOne(
  url: string | null,
  kind: OrderFileKind
): Promise<{ body: Uint8Array; contentType: string }> {
  if (!url) throw new Error("no source url recorded");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`source returned ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  const max = MAX_BYTES[kind];
  if (declared > max) throw new Error(`declared ${declared} bytes, over the ${max} limit`);

  const body = new Uint8Array(await res.arrayBuffer());
  if (body.byteLength === 0) throw new Error("source returned an empty body");
  if (body.byteLength > max) throw new Error(`${body.byteLength} bytes, over the ${max} limit`);

  const headerType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  // An auction serving `text/html` here means a redirect to a login or an
  // error page, not a photo. Storing it would put a web page in the gallery.
  const contentType = headerType && ALLOWED_TYPES[kind][headerType] ? headerType : null;
  if (!contentType) throw new Error(`source returned ${headerType ?? "no content-type"}`);

  return { body, contentType };
}
