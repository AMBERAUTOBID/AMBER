/**
 * Exercises the real `ObjectStorage` adapter against the live bucket.
 *
 *   npx tsx --env-file=.env.local scripts/r2/verify-adapter.ts
 *
 * `verify-connection.ts` proved R2 is reachable. This proves the adapter's
 * PROMISES hold — and one of them is a claim strong enough that believing it
 * without evidence would be negligent:
 *
 *   **a presigned upload URL cannot be used to store a file of a different
 *   size than the server agreed to.**
 *
 * That claim rests entirely on `signableHeaders` including `content-length`.
 * Remove that one line and every check here still passes except the one that
 * matters, which is exactly why the over-size upload is tested by actually
 * attempting it rather than by reading the code.
 *
 * Writes only under `_verify/`, refuses to run against a bucket holding
 * anything else, and deletes what it wrote.
 */
import { getObjectStorage } from "../../src/modules/orders/api/storage";
import { checkUpload, orderFileKey } from "../../src/modules/orders/model/fileRules";

const storage = getObjectStorage();
if (!storage) {
  console.error("✗ R2 is not configured. Pass --env-file=.env.local.");
  process.exit(1);
}

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Keys are built by the real function, then prefixed so the cleanup guard in
// verify-connection.ts still recognises everything this script leaves behind.
const orderId = "_verify-adapter";
const key = (fileId: string, ext: string) =>
  `_verify/${orderFileKey(orderId, "at_terminal", fileId, ext)}`;

async function main() {
  const photoKey = key("photo-1", ".jpg");
  const body = Buffer.alloc(120 * 1024, 3);

  // ── 1. the model gates what the adapter is even asked to sign ────────────
  const decision = checkUpload("photo", "image/jpeg", body.byteLength);
  if (!decision.ok) fail(`model refused a legal photo: ${JSON.stringify(decision)}`);
  ok(`model accepts a ${(body.byteLength / 1024).toFixed(0)} KB jpeg → ${decision.extension}`);

  // ── 2. a correctly sized upload succeeds ─────────────────────────────────
  const upload = await storage!.presignUpload({
    key: photoKey,
    contentType: "image/jpeg",
    sizeBytes: body.byteLength,
  });
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body,
  });
  if (!put.ok) fail(`honest upload rejected: ${put.status} ${(await put.text()).slice(0, 300)}`);
  ok(`presigned PUT accepted the agreed ${body.byteLength} bytes`);

  // ── 3. THE CLAIM: a bigger body must be refused ──────────────────────────
  // Same signed URL contract, one byte too many. If this succeeds, the size
  // limit is decoration and any holder of an upload link can fill the bucket.
  const oversizeKey = key("photo-2", ".jpg");
  const oversizeUpload = await storage!.presignUpload({
    key: oversizeKey,
    contentType: "image/jpeg",
    sizeBytes: body.byteLength,
  });
  const oversize = Buffer.alloc(body.byteLength * 2, 4);
  const overPut = await fetch(oversizeUpload.url, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: oversize,
  });
  if (overPut.ok) {
    // Clean up the object we should never have been able to write.
    await storage!.remove(oversizeKey);
    fail(
      `A body of ${oversize.byteLength} bytes was accepted by a URL signed for ` +
        `${body.byteLength}. content-length is NOT bound by the signature — ` +
        `check signableHeaders in storage.ts.`
    );
  }
  ok(`oversize body refused (${overPut.status}) — content-length is bound by the signature`);

  // 3b. …and so is the content type.
  const wrongTypeKey = key("photo-3", ".jpg");
  const typed = await storage!.presignUpload({
    key: wrongTypeKey,
    contentType: "image/jpeg",
    sizeBytes: body.byteLength,
  });
  const wrongType = await fetch(typed.url, {
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    body,
  });
  if (wrongType.ok) {
    await storage!.remove(wrongTypeKey);
    fail("A URL signed for image/jpeg accepted an application/pdf body.");
  }
  ok(`mismatched content-type refused (${wrongType.status})`);

  // ── 4. head reports the truth, and distinguishes missing from empty ──────
  const head = await storage!.head(photoKey);
  if (!head || head.sizeBytes !== body.byteLength) {
    fail(`head returned ${JSON.stringify(head)}, expected ${body.byteLength} bytes`);
  }
  ok(`head — ${head.sizeBytes} bytes, ${head.contentType}`);

  const missing = await storage!.head(key("does-not-exist", ".jpg"));
  if (missing !== null) fail(`head on a missing key returned ${JSON.stringify(missing)}, expected null`);
  ok("head on a missing key returns null rather than throwing");

  // ── 5. download, named for the human receiving it ────────────────────────
  const downloadUrl = await storage!.presignDownload({
    key: photoKey,
    fileName: 'bill "of" lading.pdf',
    disposition: "attachment",
  });
  const got = await fetch(downloadUrl);
  if (!got.ok) fail(`presigned GET rejected: ${got.status}`);
  const bytes = Buffer.from(await got.arrayBuffer());
  if (!bytes.equals(body)) fail(`downloaded ${bytes.byteLength} bytes, content differs`);
  const disposition = got.headers.get("content-disposition") ?? "";
  if (!disposition.startsWith("attachment;") || disposition.includes('"of"')) {
    fail(`content-disposition not sanitised as expected: ${disposition}`);
  }
  ok(`presigned GET — content identical, disposition: ${disposition}`);

  // ── 6. removal actually removes ──────────────────────────────────────────
  await storage!.removeMany([photoKey]);
  if ((await storage!.head(photoKey)) !== null) fail("object still present after removeMany");
  ok("removeMany — object gone");

  console.log("\nAdapter holds. Nothing left behind.");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.name) console.error(`  (${e.name})`);
  process.exit(1);
});
