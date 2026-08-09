/**
 * Is the auction's `video` media entry a downloadable file, or a player page?
 *
 *   npx tsx --env-file=.env.local scripts/r2/measure-lot-video.ts [lot...]
 *
 * Read-only. It fetches at most the first 256 KB of any candidate and never
 * writes anything.
 *
 * The distinction decides whether an auction video can be archived at all. A
 * `.mp4` served as `video/mp4` can be copied into R2 like a photo. A link to
 * an HTML player, or a HLS manifest whose segments live elsewhere, cannot —
 * and storing the URL instead would put a dead link in a case file that is
 * supposed to outlive the auction listing by years.
 *
 * The same question is asked of `vr360`, on the assumption it is a viewer.
 * Assumptions are what this script exists to replace.
 */
import { getVehicleDetail, searchVehicles } from "../../src/modules/inventory/api/client";

interface MediaItem {
  type?: string;
  thumb?: string;
  large?: string;
  full?: string;
  url?: string;
}

/** First bytes of a file identify it regardless of what the headers claim. */
function sniff(buf: Buffer): string {
  const head = buf.subarray(0, 16);
  const ascii = buf.subarray(0, 400).toString("utf8").toLowerCase();
  if (head.subarray(4, 8).toString("ascii") === "ftyp") return "MP4/MOV container (ftyp)";
  if (ascii.startsWith("#extm3u")) return "HLS manifest (.m3u8) — segments live elsewhere";
  if (ascii.includes("<!doctype html") || ascii.includes("<html")) return "HTML page";
  if (head[0] === 0xff && head[1] === 0xd8) return "JPEG";
  return `unknown (first bytes: ${head.toString("hex").slice(0, 24)})`;
}

async function inspect(label: string, url: string) {
  console.log(`\n  ${label}`);
  console.log(`    url : ${url.slice(0, 130)}`);
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-262143" } });
    const type = res.headers.get("content-type") ?? "—";
    const len = res.headers.get("content-length");
    const range = res.headers.get("content-range");
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`    http: ${res.status}  content-type: ${type}`);
    console.log(`    len : ${len ?? "—"}${range ? `  range: ${range}` : ""}  received ${(buf.byteLength / 1024).toFixed(0)} KB`);
    console.log(`    body: ${sniff(buf)}`);

    // A server that honours Range is one we can stream from, which matters if
    // the file turns out to be large.
    console.log(`    range supported: ${res.status === 206 ? "yes (206)" : "no"}`);
  } catch (e) {
    console.log(`    fetch failed: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  let lots = process.argv.slice(2);

  if (lots.length === 0) {
    console.log("Looking for lots that advertise a video…");
    const res = await searchVehicles({ s: "bmw", per_page: 40 });
    const found: string[] = [];
    for (const v of res?.data ?? []) {
      if (v.media?.has_video && v.lot_number) found.push(v.lot_number);
      if (found.length >= 3) break;
    }
    lots = found;
    console.log(`  candidates: ${lots.join(", ") || "none in this page"}`);
  }

  if (lots.length === 0) {
    console.log("No lot with has_video found. Pass lot numbers as arguments.");
    return;
  }

  for (const lot of lots) {
    const detail = await getVehicleDetail(lot);
    const d = detail?.data;
    const items = (d?.media?.items ?? []) as MediaItem[];
    console.log(`\n─── ${lot} — ${d?.year ?? "?"} ${d?.make ?? ""} ${d?.model ?? ""} (${d?.platform})`);
    console.log(`  has_video=${d?.media?.has_video} has_360=${d?.media?.has_360}`);

    const nonImage = items.filter((i) => i.type !== "image");
    if (nonImage.length === 0) {
      console.log("  no video/vr360 entries on the detail response");
      continue;
    }
    for (const item of nonImage) {
      const url = item.url ?? item.full ?? item.large ?? item.thumb;
      if (!url) {
        console.log(`\n  ${item.type}: entry present but carries no url — nothing to archive`);
        continue;
      }
      await inspect(`${item.type}`, url);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
