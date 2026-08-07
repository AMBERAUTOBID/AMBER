/**
 * Second pass, fixing a flaw in the first.
 *
 * The first test sampled ONE lot per document type, so its conclusion that "every
 * exact doc_type maps to one flag pair" was vacuous — with n=1 per string a
 * conflict is impossible by construction. This samples SEVERAL lots sharing the
 * SAME doc_type, which is the only way to learn whether the string determines the
 * flags or merely correlates with them.
 *
 * That distinction decides the Apibara question. If a doc_type reliably implies
 * the flags, we can harvest a lookup table once and cancel Apibara. If the same
 * string yields different flags on different lots, the flags come from somewhere
 * we cannot see and cancelling means losing the exportability line for good.
 */
import { neon } from "@neondatabase/serverless";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const mirror = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;
const apibaraKey = process.env.APIBARA_API_KEY;
const TYPES = Number(process.env.TYPES ?? 8);
const PER_TYPE = Number(process.env.PER_TYPE ?? 4);

if (!mirror || mirror.includes(PRODUCTION_ENDPOINT) || !apibaraKey) {
  console.error("Need DATABASE_URL_MIRROR (non-production) and APIBARA_API_KEY.");
  process.exit(1);
}

const sql = neon(mirror);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flags(vin: string) {
  const res = await fetch(
    `https://apibara.tech/api/v1/vehicle-auction/vehicles/${encodeURIComponent(vin)}`,
    { headers: { "X-API-Key": apibaraKey! } }
  );
  if (res.status !== 200) return null;
  const j = (await res.json()) as { data?: { sale_document?: Record<string, unknown> } };
  const sd = j?.data?.sale_document ?? {};
  return {
    name: typeof sd.name === "string" ? sd.name : null,
    export: typeof sd.export === "boolean" ? sd.export : null,
    registration: typeof sd.registration === "boolean" ? sd.registration : null,
  };
}

async function main() {
  // The most common document types, so each has enough lots to repeat.
  const common = (await sql`
    select doc_type as "docType", count(*)::int as n
    from auction_lots
    where doc_type is not null and vin is not null and vin <> ''
    group by doc_type
    having count(*) >= ${PER_TYPE}
    order by count(*) desc
    limit ${TYPES}
  `) as unknown as { docType: string; n: number }[];

  console.log(`testing ${common.length} document types, ${PER_TYPE} lots each\n`);

  let allConsistent = true;

  for (const { docType, n } of common) {
    const lots = (await sql`
      select vin, platform from auction_lots
      where doc_type = ${docType} and vin is not null and vin <> ''
      order by lot_number
      limit ${PER_TYPE}
    `) as unknown as { vin: string; platform: string }[];

    const seen: string[] = [];
    const names = new Set<string>();
    for (const l of lots) {
      const f = await flags(l.vin);
      await sleep(350);
      if (!f) continue;
      seen.push(`${f.export}/${f.registration}`);
      if (f.name) names.add(f.name);
    }

    const distinct = new Set(seen);
    const consistent = distinct.size <= 1;
    if (!consistent) allConsistent = false;

    console.log(`${docType}`);
    console.log(
      `  (${n} lots in mirror) sampled ${seen.length}: export/registration = {${[...distinct].join(", ")}}  ${consistent ? "STABLE" : "VARIES"}`
    );
    console.log(`  Apibara's own wording: ${[...names].join(" | ") || "-"}`);
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(
    allConsistent
      ? "Every tested document type produced the SAME flags on every lot.\n" +
          "=> A doc_type -> flags lookup table is viable. Harvest it once from\n" +
          "   Apibara (~415 requests, negligible on the Basic plan), then the flags\n" +
          "   survive cancelling Apibara. Unseen types must render as 'unknown',\n" +
          "   never as a guess."
      : "At least one document type produced DIFFERENT flags on different lots.\n" +
          "=> The flags are NOT a function of the document string. They cannot be\n" +
          "   reconstructed, and cancelling Apibara means losing them."
  );
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
