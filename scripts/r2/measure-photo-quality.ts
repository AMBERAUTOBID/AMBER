/**
 * Follow-up to `measure-lot-photos.ts`, which raised three questions worth an
 * answer before any photo is archived permanently.
 *
 *   npx tsx --env-file=.env.local scripts/r2/measure-photo-quality.ts
 *
 * Read-only; HEAD and GET against the auction CDNs only, nothing written.
 *
 * 1. **IAAI serves a RESIZER, not a file.** Its urls look like
 *    `.../resizer?imageKeys=…&width=845&height=633`, so what the API calls
 *    "large" is whatever size someone put in the query string. If a bigger
 *    number returns a bigger image, archiving 845px would be throwing away
 *    detail we can never get back.
 * 2. **Copart urls end in `_hrs.jpg`.** Copart is known to serve several
 *    suffixes. If `_ful.jpg` exists and is larger, same problem.
 * 3. **Does the gallery survive the sale?** A case file is created after the
 *    client has won, which is by definition after the lot closed. If the
 *    photos vanish at that moment, the entire copy step has to happen earlier
 *    and the whole design changes.
 */
import { getRelatedVehicles, getVehicleDetail, searchVehicles } from "../../src/modules/inventory/api/client";

interface MediaItem {
  type?: string;
  thumb?: string;
  large?: string;
  full?: string;
  url?: string;
}

async function measure(url: string): Promise<{ status: number; bytes: number | null; type: string | null }> {
  try {
    // GET rather than HEAD: a resizer often ignores HEAD or reports the
    // unresized length, and the number that matters is what actually arrives.
    const res = await fetch(url);
    if (!res.ok) return { status: res.status, bytes: null, type: null };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes: buf.byteLength, type: res.headers.get("content-type") };
  } catch {
    return { status: 0, bytes: null, type: null };
  }
}

function fmt(n: number | null): string {
  return n === null ? "—" : `${(n / 1024).toFixed(0)} KB`;
}

async function imagesOf(lot: string): Promise<{ items: MediaItem[]; state?: string; label: string }> {
  const detail = await getVehicleDetail(lot);
  const d = detail?.data;
  const items = (d?.media?.items ?? []) as MediaItem[];
  return {
    items,
    state: d?.auction?.state,
    label: `${d?.year ?? "?"} ${d?.make ?? ""} ${d?.model ?? ""} (${d?.platform})`,
  };
}

async function question1_iaaiResizer() {
  console.log("\n═══ 1. IAAI resizer — does a bigger width return a bigger image? ═══");
  const res = await searchVehicles({ s: "bmw", platform: "iaai", per_page: 3 });
  const lot = (res?.data ?? [])[0]?.lot_number;
  if (!lot) return console.log("  no IAAI lot sampled");

  const { items, label } = await imagesOf(lot);
  const base = items.find((i) => i.type === "image")?.large;
  if (!base) return console.log("  no large url on the first image");

  console.log(`  lot ${lot} — ${label}`);
  for (const width of [845, 1280, 1920, 2400, 3200, 4096, 6000]) {
    const url = base.replace(/width=\d+/, `width=${width}`).replace(/height=\d+/, `height=${Math.round((width * 633) / 845)}`);
    const r = await measure(url);
    console.log(`  width=${String(width).padStart(4)} → ${r.status} ${fmt(r.bytes)} ${r.type ?? ""}`);
  }
  console.log("  (identical byte counts mean the resizer caps out and 845 is already everything)");
}

async function question2_copartSuffix() {
  console.log("\n═══ 2. Copart suffix — is there a larger file than _hrs.jpg? ═══");
  const res = await searchVehicles({ s: "bmw", platform: "copart", per_page: 3 });
  const lot = (res?.data ?? [])[0]?.lot_number;
  if (!lot) return console.log("  no Copart lot sampled");

  const { items, label } = await imagesOf(lot);
  const base = items.find((i) => i.type === "image")?.full ?? items[0]?.large;
  if (!base) return console.log("  no url on the first image");

  console.log(`  lot ${lot} — ${label}`);
  console.log(`  as given: ${base.slice(0, 95)}`);
  const suffixMatch = base.match(/_(\w+)\.jpg$/);
  const given = suffixMatch?.[1] ?? "?";
  for (const suffix of [given, "ful", "hrs", "thb"]) {
    const url = base.replace(/_\w+\.jpg$/, `_${suffix}.jpg`);
    const r = await measure(url);
    const tag = suffix === given ? " (as given)" : "";
    console.log(`  _${suffix.padEnd(3)} → ${r.status} ${fmt(r.bytes)}${tag}`);
  }
}

async function question3_afterTheSale() {
  console.log("\n═══ 3. Does the gallery survive the sale? ═══");
  // `related.past` is the one place the API hands over lots that have already
  // sold, which is exactly the state every case file starts in.
  const res = await searchVehicles({ s: "bmw", per_page: 3 });
  const seed = (res?.data ?? [])[0]?.lot_number;
  if (!seed) return console.log("  no seed lot");

  const related = await getRelatedVehicles(seed);
  const past = related?.data?.past ?? [];
  console.log(`  seed ${seed} → ${past.length} past (sold) lots offered`);

  let checked = 0;
  for (const p of past) {
    if (checked >= 3) break;
    if (!p.lot_number) continue;
    checked++;
    try {
      const { items, state, label } = await imagesOf(p.lot_number);
      const photos = items.filter((i) => i.type === "image").length;
      const sold = p.auction?.last_sold_day ?? "—";
      console.log(
        `  lot ${p.lot_number.padEnd(10)} state=${(state ?? "?").padEnd(8)} sold=${String(sold).padEnd(12)} photos=${photos}  ${label}`
      );
      // A url that resolves is the real proof; a populated array of dead links
      // would look identical in the JSON.
      const first = items.find((i) => i.type === "image");
      const url = first?.full ?? first?.large;
      if (url) {
        const r = await measure(url);
        console.log(`      first photo actually fetches: ${r.status} ${fmt(r.bytes)}`);
      }
    } catch (e) {
      console.log(`  lot ${p.lot_number} — lookup failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function main() {
  await question1_iaaiResizer();
  await question2_copartSuffix();
  await question3_afterTheSale();
  console.log("");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
