/**
 * Does the bucket's CORS policy actually allow a browser upload — and only
 * from where it should?
 *
 *   npx tsx --env-file=.env.local scripts/r2/verify-cors.ts
 *
 * Writes one small object under `_verify/` and deletes it.
 *
 * A presigned PUT from a page is TWO requests, and the first one is the gate:
 * the browser sends an `OPTIONS` preflight and refuses to send the body at all
 * unless the response names its origin. So a policy can look right in the
 * dashboard and still block every upload, and the only way to know is to send
 * the preflight.
 *
 * The negative case matters as much as the positive one. A policy that allows
 * an unknown origin is a policy that lets any page on the internet drive
 * uploads with a leaked link, and "it works from my dev server" would not
 * notice that at all.
 */
import { getObjectStorage } from "../../src/modules/orders/api/storage";

const ALLOWED = ["http://localhost:3101", "http://localhost:3102"];
const SHOULD_BE_BLOCKED = ["https://evil.example.com", "http://localhost:9999"];

let failures = 0;
function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function bad(msg: string) {
  failures++;
  console.log(`  ✗ ${msg}`);
}

async function preflight(url: string, origin: string) {
  const res = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });
  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
    allowMethods: res.headers.get("access-control-allow-methods"),
  };
}

async function main() {
  const storage = getObjectStorage();
  if (!storage) {
    console.error("✗ R2 not configured.");
    process.exit(1);
  }

  const key = "_verify/cors-check.txt";
  const body = new TextEncoder().encode("cors check");

  const { url } = await storage.presignUpload({
    key,
    contentType: "text/plain",
    sizeBytes: body.byteLength,
  });

  console.log("preflight — origins that SHOULD be allowed");
  for (const origin of ALLOWED) {
    const r = await preflight(url, origin);
    if (r.allowOrigin === origin || r.allowOrigin === "*") {
      ok(`${origin} → ${r.status}, allow-origin: ${r.allowOrigin}, methods: ${r.allowMethods}`);
    } else {
      bad(`${origin} → ${r.status}, allow-origin: ${r.allowOrigin ?? "(none)"} — uploads will be blocked`);
    }
  }

  console.log("\npreflight — origins that must NOT be allowed");
  for (const origin of SHOULD_BE_BLOCKED) {
    const r = await preflight(url, origin);
    if (!r.allowOrigin) {
      ok(`${origin} → refused, as it should be`);
    } else {
      bad(`${origin} → ALLOWED (${r.allowOrigin}). The policy is open to anyone.`);
    }
  }

  // ── and the upload itself, with the header a browser would send ─────────
  console.log("\nthe upload a browser would actually make");
  const put = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/plain", origin: "http://localhost:3102" },
    body,
  });
  if (!put.ok) {
    bad(`PUT from localhost:3102 rejected: ${put.status} ${(await put.text()).slice(0, 200)}`);
  } else {
    const head = await storage.head(key);
    if (head?.sizeBytes === body.byteLength) {
      ok(`PUT stored ${head.sizeBytes} bytes; response allow-origin: ${put.headers.get("access-control-allow-origin") ?? "(none)"}`);
    } else {
      bad(`PUT returned ${put.status} but the object is ${JSON.stringify(head)}`);
    }
  }

  await storage.remove(key);
  ok("cleaned up");

  console.log(failures === 0 ? "\nCORS is correct: open to our origins, closed to everything else.\n" : `\n${failures} problem(s).\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
