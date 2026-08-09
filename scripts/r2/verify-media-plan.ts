/**
 * Does the pure media layer actually produce URLs that work?
 *
 *   npx tsx --env-file=.env.local scripts/r2/verify-media-plan.ts [lot...]
 *
 * Read-only against the auction CDNs; writes nothing.
 *
 * `lotMedia.test.ts` proves the rewriting is what it claims. It cannot prove
 * the rewritten URL resolves — the unit tests compare strings, and a string
 * that 404s looks identical to one that doesn't. That gap matters more here
 * than usual: the archive runs once, and a broken width rewrite would fetch
 * nothing on every lot while every test stayed green.
 *
 * So this takes real lots, runs the real functions, and fetches what comes
 * out — asserting that the upgrade genuinely returns MORE bytes than the URL
 * the API handed over.
 */
import { getVehicleDetail, searchVehicles } from "../../src/modules/inventory/api/client";
import { archivableMedia, bestImageUrl, estimateArchiveBytes, type LotMediaItem } from "../../src/modules/orders/model/lotMedia";

let failures = 0;

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function bad(msg: string) {
  failures++;
  console.log(`  ✗ ${msg}`);
}

async function bytesOf(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).byteLength;
  } catch {
    return null;
  }
}

async function check(lot: string) {
  const detail = await getVehicleDetail(lot);
  const d = detail?.data;
  if (!d) return bad(`${lot}: no data`);

  const items = (d.media?.items ?? []) as LotMediaItem[];
  const plan = archivableMedia(items);
  const rawTypes = new Set(items.map((i) => i.type));

  console.log(`\n─── ${lot} — ${d.year ?? "?"} ${d.make ?? ""} ${d.model ?? ""} (${d.platform})`);
  console.log(
    `  source types: ${[...rawTypes].join(", ")} → plan: ` +
      `${plan.filter((m) => m.kind === "photo").length} photos, ${plan.filter((m) => m.kind === "video").length} video`
  );
  console.log(`  estimated archive: ${(estimateArchiveBytes(plan) / 1024 / 1024).toFixed(1)} MB`);

  // The 360 viewer must never survive planning — it is an HTML page.
  if (rawTypes.has("vr360") && plan.some((m) => m.url.includes("ThreeSixtyView"))) {
    bad("a vr360 viewer url survived into the archive plan");
  } else if (rawTypes.has("vr360")) {
    ok("vr360 dropped");
  }

  const firstPhoto = plan.find((m) => m.kind === "photo");
  if (!firstPhoto) return bad("no photo planned");

  const upgraded = await bytesOf(firstPhoto.url);
  if (upgraded === null) return bad(`planned photo url did not fetch: ${firstPhoto.url.slice(0, 110)}`);

  // Compare against what the API handed over untouched, which is the whole
  // point of the rewrite.
  const original = items.find((i) => i.type === "image");
  const originalUrl = original?.full ?? original?.large ?? original?.url;
  const originalBytes = originalUrl ? await bytesOf(originalUrl) : null;

  const isResizer = firstPhoto.url.includes("resizer");
  console.log(
    `  first photo: ${(upgraded / 1024).toFixed(0)} KB` +
      (originalBytes ? ` (as given: ${(originalBytes / 1024).toFixed(0)} KB)` : "")
  );

  if (isResizer) {
    if (originalBytes && upgraded > originalBytes * 1.5) {
      ok(`upgrade gained ${(upgraded / originalBytes).toFixed(1)}x more detail`);
    } else {
      bad(`upgrade gained nothing — ${upgraded} vs ${originalBytes}. Is the resizer shape still the same?`);
    }
  } else if (originalBytes && upgraded === originalBytes) {
    ok("Copart url passed through untouched, as intended");
  }

  const video = plan.find((m) => m.kind === "video");
  if (video) {
    const res = await fetch(video.url, { headers: { range: "bytes=0-1023" } });
    const type = res.headers.get("content-type") ?? "";
    const total = res.headers.get("content-range")?.split("/")[1];
    if (type.startsWith("video/")) {
      ok(`video is ${type}${total ? `, ${(Number(total) / 1024 / 1024).toFixed(1)} MB` : ""}`);
    } else {
      bad(`planned video is not a video: ${type}`);
    }
  }
}

async function main() {
  let lots = process.argv.slice(2);
  if (lots.length === 0) {
    // One of each platform, so both branches of the rewrite are exercised.
    const [iaai, copart] = await Promise.all([
      searchVehicles({ s: "bmw", platform: "iaai", per_page: 3 }),
      searchVehicles({ s: "bmw", platform: "copart", per_page: 3 }),
    ]);
    lots = [
      ...(iaai?.data ?? []).slice(0, 2).map((v) => v.lot_number),
      ...(copart?.data ?? []).slice(0, 2).map((v) => v.lot_number),
    ].filter(Boolean);
  }

  for (const lot of lots) {
    try {
      await check(lot);
    } catch (e) {
      bad(`${lot}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(failures === 0 ? "\nMedia plan holds against live lots.\n" : `\n${failures} failure(s).\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

// Silence the unused-import warning for the helper the checks above use
// indirectly through `archivableMedia`.
void bestImageUrl;
