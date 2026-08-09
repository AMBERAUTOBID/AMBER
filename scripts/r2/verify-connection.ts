/**
 * Proves the R2 bucket is reachable and behaves the way the case-file feature
 * needs it to — before any of that feature exists.
 *
 *   npx tsx --env-file=.env.local scripts/r2/verify-connection.ts
 *
 * Read-write, but only against keys under `_verify/`, and it deletes what it
 * wrote. It refuses to run if the bucket already holds anything outside that
 * prefix, so it can never be pointed at a bucket with real client files in it.
 *
 * It checks five things, in the order they will actually be used:
 *
 *   1. credentials + endpoint         — can we talk to the bucket at all
 *   2. put / get round trip           — server-side writes (auction photo copy)
 *   3. presigned PUT, used for real   — the browser upload path for video,
 *                                       which is the only way past Vercel's
 *                                       4.5 MB request body limit
 *   4. presigned GET                  — how a client is served a private file
 *   5. delete                         — removing a file from a stage
 *
 * Point 3 is the one worth having a script for. A presigned PUT can be
 * generated successfully and still be rejected on use — wrong region, a
 * checksum header the browser won't send, a CORS rule that doesn't cover the
 * method. Generating the URL proves nothing; sending a body to it proves it.
 *
 * This script lives in the repo rather than a scratch directory because Node
 * resolves `node_modules` by walking up from the FILE, not the cwd.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PREFIX = "_verify/";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is not set. Pass --env-file=.env.local.`);
    process.exit(1);
  }
  return value;
}

const endpoint = required("R2_ENDPOINT");
const bucket = required("R2_BUCKET");
const accessKeyId = required("R2_ACCESS_KEY_ID");
const secretAccessKey = required("R2_SECRET_ACCESS_KEY");

/**
 * `region: "auto"` is what R2 expects — it has no regions in the AWS sense;
 * the endpoint's jurisdiction decides where bytes live.
 *
 * The two checksum settings are not cosmetic. Recent AWS SDK versions attach a
 * CRC32 checksum to every request by default, which for a PRESIGNED url means
 * the signature covers a header the browser will never send — so the upload is
 * signed correctly and rejected anyway. WHEN_REQUIRED puts that back to
 * "only when the operation demands it".
 */
const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

async function main() {
  console.log(`bucket   : ${bucket}`);
  console.log(`endpoint : ${endpoint}`);
  console.log("");

  // 1. Reachability, and the refuse-to-run guard in the same call.
  const existing = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 20 }));
  const foreign = (existing.Contents ?? []).filter((o) => !o.Key?.startsWith(PREFIX));
  if (foreign.length > 0) {
    console.error(
      `✗ Refusing to run: bucket already holds ${foreign.length} object(s) outside ${PREFIX}.\n` +
        `  This script writes and deletes. Point it at an empty bucket.`
    );
    process.exit(1);
  }
  ok(`reachable — ${existing.KeyCount ?? 0} object(s) present, none outside ${PREFIX}`);

  // A key shaped like the real thing: orders/<id>/<stage>/<file>.
  const key = `${PREFIX}orders/connection-check/probe.txt`;
  const body = `smartautobid r2 check ${new Date().toISOString()}`;

  // 2. Server-side write, then read it back and compare. This is the path the
  //    auction-photo copy will use.
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain",
    })
  );
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const readBack = await got.Body!.transformToString();
  if (readBack !== body) {
    console.error(`✗ Round trip mismatch.\n  wrote: ${body}\n  read : ${readBack}`);
    process.exit(1);
  }
  ok(`put/get round trip — ${Buffer.byteLength(body)} bytes, content identical`);

  // 3. The browser upload path. Generate a presigned PUT and actually use it.
  const videoKey = `${PREFIX}orders/connection-check/presigned.bin`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: videoKey,
      ContentType: "application/octet-stream",
    }),
    { expiresIn: 300 }
  );
  const payload = Buffer.alloc(64 * 1024, 7); // 64 KB, stands in for a video
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: payload,
  });
  if (!put.ok) {
    console.error(
      `✗ Presigned PUT rejected: ${put.status} ${put.statusText}\n` +
        `  ${(await put.text()).slice(0, 400)}`
    );
    process.exit(1);
  }
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: videoKey }));
  if (head.ContentLength !== payload.byteLength) {
    console.error(`✗ Uploaded ${payload.byteLength} bytes but bucket reports ${head.ContentLength}.`);
    process.exit(1);
  }
  ok(`presigned PUT used for real — ${payload.byteLength} bytes stored, size confirmed`);

  // 4. The download path a client hits: a short-lived signed GET, no public
  //    bucket, no custom domain.
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: videoKey }),
    { expiresIn: 300 }
  );
  const fetched = await fetch(downloadUrl);
  if (!fetched.ok) {
    console.error(`✗ Presigned GET rejected: ${fetched.status} ${fetched.statusText}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await fetched.arrayBuffer());
  if (!bytes.equals(payload)) {
    console.error(`✗ Downloaded ${bytes.byteLength} bytes, content differs from what was uploaded.`);
    process.exit(1);
  }
  ok("presigned GET — byte-for-byte identical to what was uploaded");

  // 5. Clean up after ourselves, and prove removal actually removes.
  for (const k of [key, videoKey]) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
  }
  const after = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
  if ((after.KeyCount ?? 0) !== 0) {
    console.error(`✗ ${after.KeyCount} object(s) still under ${PREFIX} after delete.`);
    process.exit(1);
  }
  ok("delete — bucket is empty again");

  console.log("\nR2 is ready.");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  // The name is what distinguishes "wrong key" from "wrong bucket" from
  // "wrong endpoint", and it is the first thing worth knowing.
  if (e instanceof Error && e.name) console.error(`  (${e.name})`);
  process.exit(1);
});
