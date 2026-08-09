/**
 * End-to-end proof that a real auction lot becomes a real case file.
 *
 *   npx tsx --env-file=.env.local scripts/r2/verify-order-flow.ts [lot]
 *   KEEP=0 npx tsx --env-file=.env.local scripts/r2/verify-order-flow.ts   # clean up after
 *
 * Runs against the MIRROR branch only, behind the same refuse-to-run guard as
 * `preflight.ts`. It aborts if the target is production.
 *
 * This exists because the browser path cannot be walked without a login: the
 * mirror carries a copy of `sessions` taken when the branch was made, so no
 * current session cookie resolves there. Every layer below the page is
 * exercised here instead — snapshot, reference, order row, timeline event,
 * planning, batched import, real bytes in R2, and a signed URL that actually
 * returns them.
 *
 * By default it LEAVES the file in place, so there is something real to look
 * at in the morning. The cleanup command is printed at the end.
 */
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "../../src/shared/db/client";
import { getVehicleDetail, searchVehicles } from "../../src/modules/inventory/api/client";
import { buildOrderSnapshot, orderTitle } from "../../src/modules/orders/model/orderSnapshot";
import { archivableMedia } from "../../src/modules/orders/model/lotMedia";
import {
  auctionImportSummary,
  createOrder,
  listOrderFiles,
  listStageEvents,
} from "../../src/modules/orders/model/orders";
import { importPendingMedia, planAuctionMediaImport } from "../../src/modules/orders/api/importMedia";
import { getObjectStorage } from "../../src/modules/orders/api/storage";
import { signFiles } from "../../src/modules/orders/api/signFiles";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const MIRROR_ENDPOINT = "ep-misty-resonance-asjvq39e";

const mirror = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;
if (!mirror) {
  console.error("DATABASE_URL_MIRROR is not set. Refusing to guess.");
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT) || !mirror.includes(MIRROR_ENDPOINT)) {
  console.error("ABORT: DATABASE_URL_MIRROR does not point at the mirror branch.");
  process.exit(1);
}

/**
 * Static imports are safe above this line because every consumer of
 * DATABASE_URL in this codebase reads it LAZILY — `db()` on its first query,
 * `getObjectStorage()` on its first call. Nothing captures it at import time,
 * so setting it here still lands before anything connects. Nothing on disk
 * changes; this process only.
 */
process.env.DATABASE_URL = mirror;

const KEEP = process.env.KEEP !== "0";

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`target : ${/@([^/]+)/.exec(mirror!)?.[1]}\n`);

  // ── a real client to file it against ────────────────────────────────────
  const users = await db()
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(isNull(schema.users.deletedAt))
    .limit(1);
  const user = users[0];
  if (!user) fail("no user in the mirror to file against");
  ok(`client: ${user.name}`);

  // ── a real lot ──────────────────────────────────────────────────────────
  let lot = process.argv[2];
  if (!lot) {
    const found = await searchVehicles({ s: "bmw", per_page: 5 });
    lot = (found?.data ?? []).find((v) => v.media?.has_video)?.lot_number
      ?? (found?.data ?? [])[0]?.lot_number;
  }
  if (!lot) fail("could not sample a lot");

  const detail = await getVehicleDetail(lot);
  const snapshot = buildOrderSnapshot(detail?.data);
  if (!snapshot) fail(`lot ${lot} did not produce a snapshot`);
  ok(`lot ${lot}: ${orderTitle(snapshot)} (${snapshot.platform}, title ${snapshot.titleClass})`);

  const media = archivableMedia(detail?.data?.media?.items ?? []);
  ok(`media planned: ${media.filter((m) => m.kind === "photo").length} photos, ${media.filter((m) => m.kind === "video").length} video`);

  // ── create ──────────────────────────────────────────────────────────────
  const order = await createOrder({ userId: user.id, snapshot, createdBy: null });
  ok(`order created: ${order.reference}`);

  const events = await listStageEvents(order.id);
  if (events.length !== 1 || events[0]!.stage !== "won") {
    fail(`expected one 'won' timeline event, got ${JSON.stringify(events.map((e) => e.stage))}`);
  }
  ok("timeline: one 'won' event written alongside the order");

  // ── plan ────────────────────────────────────────────────────────────────
  const plan = await planAuctionMediaImport({
    orderId: order.id,
    mediaItems: detail?.data?.media?.items ?? [],
    createdBy: null,
  });
  ok(`planned ${plan.planned} files, estimated ${(plan.estimatedBytes / 1024 / 1024).toFixed(1)} MB`);

  const again = await planAuctionMediaImport({
    orderId: order.id,
    mediaItems: detail?.data?.media?.items ?? [],
    createdBy: null,
  });
  if (!again.alreadyPlanned || again.planned !== 0) {
    fail("re-planning added rows; the import is not idempotent and would duplicate every photo");
  }
  ok("re-planning adds nothing — idempotent");

  // ── import, batch by batch, exactly as the browser drives it ────────────
  let batches = 0;
  const startedAt = Date.now();
  for (;;) {
    const progress = await importPendingMedia({ orderId: order.id });
    batches++;
    process.stdout.write(
      `  batch ${batches}: +${progress.imported} imported, ${progress.remaining} left, ${progress.failedTotal} failed\r`
    );
    if (progress.remaining === 0) break;
    if (batches > 40) fail("import did not converge in 40 batches");
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");

  const summary = await auctionImportSummary(order.id);
  ok(`import finished: ${summary.uploaded}/${summary.total} in ${batches} batches, ${seconds}s, ${summary.failed} failed`);
  if (summary.uploaded === 0) fail("nothing was actually stored");

  // ── the bytes are really there ──────────────────────────────────────────
  const storage = getObjectStorage();
  if (!storage) fail("R2 not configured");

  const files = await listOrderFiles(order.id);
  let totalBytes = 0;
  let checked = 0;
  for (const file of files) {
    if (!file.uploadedAt) continue;
    const head = await storage.head(file.storageKey);
    if (!head) fail(`row says uploaded but R2 has no object at ${file.storageKey}`);
    if (head.sizeBytes !== file.sizeBytes) {
      fail(`size mismatch for ${file.fileName}: row ${file.sizeBytes}, bucket ${head.sizeBytes}`);
    }
    totalBytes += head.sizeBytes;
    checked++;
  }
  ok(`${checked} objects present in R2, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, every size matches its row`);

  // ── a signed url actually serves them ───────────────────────────────────
  const signed = await signFiles(files.filter((f) => f.uploadedAt));
  const first = signed.find((f) => f.kind === "photo" && f.url);
  if (!first?.url) fail("no signed photo url produced");
  const res = await fetch(first.url);
  if (!res.ok) fail(`signed url returned ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  ok(`signed url serves ${(bytes.byteLength / 1024).toFixed(0)} KB as ${res.headers.get("content-type")}`);

  // Photos must be inline so a gallery can render them; documents download.
  const disposition = res.headers.get("content-disposition") ?? "";
  if (!disposition.startsWith("inline")) fail(`photo served as "${disposition}", expected inline`);
  ok("photos are served inline, documents as attachments");

  console.log(`\nCase file ${order.reference} is complete and real.`);

  if (KEEP) {
    console.log(
      `\nLeft in place deliberately. To remove it:\n` +
        `  KEEP=0 ORDER=${order.id} npx tsx --env-file=.env.local scripts/r2/verify-order-flow.ts`
    );
  } else {
    await cleanUp(order.id);
  }
}

/** Removes the objects first, then the rows — the reverse would strand them. */
async function cleanUp(orderId: string) {
  const storage = getObjectStorage();
  const files = await listOrderFiles(orderId);
  if (storage) await storage.removeMany(files.map((f) => f.storageKey));
  await db().delete(schema.orderFiles).where(eq(schema.orderFiles.orderId, orderId));
  await db().delete(schema.orderStageEvents).where(eq(schema.orderStageEvents.orderId, orderId));
  await db().delete(schema.vehicleOrders).where(eq(schema.vehicleOrders.id, orderId));
  ok(`cleaned up: ${files.length} objects and the order removed`);
}

// Cleanup-only mode, for the command printed at the end of a normal run.
const explicitOrder = process.env.ORDER;
const run = explicitOrder && !KEEP ? cleanUp(explicitOrder) : main();

run.catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack.split("\n").slice(1, 4).join("\n"));
  process.exit(1);
});
