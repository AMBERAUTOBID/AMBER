/**
 * How many photos can we actually copy into a case file, and from where?
 *
 *   npx tsx --env-file=.env.local scripts/r2/measure-lot-photos.ts [lot...]
 *
 * Read-only. Writes nothing anywhere.
 *
 * The recorded assumption going in is that the mirror holds ~1 photo per lot
 * while the full gallery lives upstream. Before writing a photo-copy step that
 * depends on it, that has to be a measurement rather than a note — the whole
 * point of the copy is that these images become unrecoverable once the auction
 * drops the lot, so importing one photo instead of forty is a mistake with no
 * second chance.
 *
 * It also answers a question step 4 depends on separately: does a detail
 * lookup still return the gallery AFTER the lot has sold? A case file is
 * created once the client has won, which is by definition after the sale.
 */
import { getVehicleDetail, searchVehicles } from "../../src/modules/inventory/api/client";

interface MediaItem {
  type?: string;
  thumb?: string;
  large?: string;
  full?: string;
  url?: string;
}

function pickBest(item: MediaItem): string | undefined {
  // Deliberate order: the copy should keep the largest version available,
  // because a thumbnail archived forever is a thumbnail forever.
  return item.full ?? item.large ?? item.url ?? item.thumb;
}

async function report(lot: string) {
  console.log(`\n─── ${lot} ${"─".repeat(Math.max(0, 50 - lot.length))}`);
  let detail;
  try {
    detail = await getVehicleDetail(lot);
  } catch (e) {
    console.log(`  lookup failed: ${e instanceof Error ? e.message : e}`);
    return;
  }
  const d = detail?.data;
  if (!d) {
    console.log("  no data");
    return;
  }

  const media = d.media ?? {};
  const items: MediaItem[] = media.items ?? [];
  const thumbs: string[] = media.thumbs ?? [];

  const byType = new Map<string, number>();
  for (const it of items) byType.set(it.type ?? "?", (byType.get(it.type ?? "?") ?? 0) + 1);

  const usable = items.map(pickBest).filter(Boolean) as string[];
  const distinct = new Set(usable);

  console.log(`  ${d.year ?? "?"} ${d.make ?? ""} ${d.model ?? ""}  (${d.platform})`);
  console.log(`  auction state       : ${d.auction?.state ?? "?"}   sold: ${d.auction?.last_sold_day ?? "—"}`);
  console.log(`  media.thumbs_count  : ${media.thumbs_count ?? "—"}`);
  console.log(`  media.thumbs[]      : ${thumbs.length}`);
  console.log(`  media.items[]       : ${items.length}  by type: ${JSON.stringify(Object.fromEntries(byType))}`);
  console.log(`  usable urls         : ${usable.length}  distinct: ${distinct.size}`);
  console.log(`  has_video / has_360 : ${media.has_video ?? "—"} / ${media.has_360 ?? "—"}`);

  // Which size fields are actually populated decides what "copy the biggest"
  // means in practice.
  const populated = { full: 0, large: 0, url: 0, thumb: 0 };
  for (const it of items) {
    if (it.full) populated.full++;
    if (it.large) populated.large++;
    if (it.url) populated.url++;
    if (it.thumb) populated.thumb++;
  }
  console.log(`  size fields present : ${JSON.stringify(populated)}`);

  // One real HEAD, to learn the byte cost of the copy rather than guess it.
  const sample = usable[0];
  if (sample) {
    console.log(`  sample url          : ${sample.slice(0, 100)}`);
    try {
      const res = await fetch(sample, { method: "HEAD" });
      const len = res.headers.get("content-length");
      console.log(
        `  sample HEAD         : ${res.status} ${res.headers.get("content-type") ?? "?"} ` +
          `${len ? (Number(len) / 1024).toFixed(0) + " KB" : "no content-length"}`
      );
      if (len && usable.length) {
        console.log(
          `  → estimated copy    : ${((Number(len) * usable.length) / 1024 / 1024).toFixed(1)} MB for ${usable.length} photos`
        );
      }
    } catch (e) {
      console.log(`  sample HEAD failed  : ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function main() {
  let lots = process.argv.slice(2);

  if (lots.length === 0) {
    // No lots given: take a few live ones so the script is runnable with no
    // arguments and still measures something real.
    console.log("No lots given — sampling from search…");
    const res = await searchVehicles({ s: "bmw", per_page: 6 });
    lots = (res?.data ?? []).map((v) => v.lot_number).filter(Boolean).slice(0, 4);
    console.log(`sampled: ${lots.join(", ")}`);
  }

  for (const lot of lots) await report(lot);
  console.log("");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
