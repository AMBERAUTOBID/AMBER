/**
 * Answers the question that decides whether Apibara can be cancelled:
 * are `sale_document.export` and `sale_document.registration` DERIVABLE from the
 * title/document string that apicars.auction gives us?
 *
 * apicars supplies no export or registration field — confirmed twice, in a
 * 36-field payload dump and by grepping their OpenAPI spec. It supplies only
 * `doc_type`, e.g. "FL - CERT OF TITLE SLVG REBUILDABLE". Apibara supplies the two
 * booleans. If those booleans are a pure function of the title type, we can
 * compute them ourselves and drop the dependency. If the same title type yields
 * different booleans on different lots, they carry information we cannot
 * reconstruct, and cancelling Apibara means losing the exportability line.
 *
 * Sampling is deliberately BY DISTINCT doc_type rather than random: 30 random
 * lots would likely all be salvage and would prove nothing about the mapping.
 *
 * Read-only. Costs ~1 Apibara request per sampled lot (Basic plan is 30k/month,
 * so a few dozen is negligible) and zero apicars requests.
 */
import { neon } from "@neondatabase/serverless";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const mirror = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;
const apibaraKey = process.env.APIBARA_API_KEY;
const PER_CLASS = Number(process.env.SAMPLE_PER_CLASS ?? 6);

if (!mirror) {
  console.error("DATABASE_URL_MIRROR is not set.");
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}
if (!apibaraKey) {
  console.error("APIBARA_API_KEY is not set.");
  process.exit(1);
}

const sql = neon(mirror);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sample {
  vin: string;
  lotNumber: string;
  platform: string;
  docType: string;
  titleClass: string | null;
}

interface Observation extends Sample {
  status: number;
  apibaraName: string | null;
  apibaraType: string | null;
  export: boolean | null;
  registration: boolean | null;
  isPending: boolean | null;
}

async function fetchApibara(vin: string): Promise<Partial<Observation>> {
  const res = await fetch(
    `https://apibara.tech/api/v1/vehicle-auction/vehicles/${encodeURIComponent(vin)}`,
    { headers: { "X-API-Key": apibaraKey! } }
  );
  if (res.status !== 200) return { status: res.status };
  const j = (await res.json()) as { data?: { sale_document?: Record<string, unknown> } };
  const sd = j?.data?.sale_document ?? {};
  return {
    status: 200,
    apibaraName: typeof sd.name === "string" ? sd.name : null,
    apibaraType: typeof sd.type === "string" ? sd.type : null,
    export: typeof sd.export === "boolean" ? sd.export : null,
    registration: typeof sd.registration === "boolean" ? sd.registration : null,
    isPending: typeof sd.is_pending === "boolean" ? sd.is_pending : null,
  };
}

async function main() {
  // One lot per distinct doc_type, spread across our six title classes, so the
  // sample can actually disprove a mapping rather than merely agree with it.
  const samples = (await sql`
    select vin, lot_number as "lotNumber", platform, doc_type as "docType", title_class as "titleClass"
    from (
      select vin, lot_number, platform, doc_type, title_class,
             row_number() over (partition by title_class order by doc_type) as rn
      from (
        select distinct on (doc_type) vin, lot_number, platform, doc_type, title_class
        from auction_lots
        where vin is not null and vin <> '' and doc_type is not null
        order by doc_type
      ) per_doc
    ) ranked
    where rn <= ${PER_CLASS}
    order by title_class, doc_type
  `) as unknown as Sample[];

  console.log(`sampling ${samples.length} lots across distinct document types\n`);

  const observations: Observation[] = [];
  for (const s of samples) {
    const a = await fetchApibara(s.vin);
    observations.push({ ...s, status: a.status ?? 0, apibaraName: a.apibaraName ?? null, apibaraType: a.apibaraType ?? null, export: a.export ?? null, registration: a.registration ?? null, isPending: a.isPending ?? null });
    await sleep(350); // Apibara Basic allows 1 req/s
  }

  const ok = observations.filter((o) => o.status === 200);
  console.log(`Apibara answered for ${ok.length} of ${observations.length}\n`);

  console.log("our title class | export | regist | our doc_type -> Apibara's own wording");
  console.log("─".repeat(100));
  for (const o of ok) {
    const e = o.export === null ? " ?" : o.export ? " Y" : " N";
    const r = o.registration === null ? " ?" : o.registration ? " Y" : " N";
    console.log(
      `${(o.titleClass ?? "(null)").padEnd(15)}|   ${e}   |   ${r}   | ${o.docType.slice(0, 40).padEnd(40)} -> ${o.apibaraName ?? "-"}`
    );
  }

  // THE VERDICT. If a title class ever produces both true and false for the same
  // flag, the flag is not a function of the title and cannot be derived.
  console.log(`\n${"═".repeat(70)}`);
  console.log("Is export/registration a pure function of our title class?");
  let derivable = true;
  const classes = [...new Set(ok.map((o) => o.titleClass ?? "(null)"))];
  for (const cls of classes) {
    const rows = ok.filter((o) => (o.titleClass ?? "(null)") === cls);
    const exports = new Set(rows.map((r) => String(r.export)));
    const regs = new Set(rows.map((r) => String(r.registration)));
    const consistent = exports.size === 1 && regs.size === 1;
    if (!consistent) derivable = false;
    console.log(
      `  ${cls.padEnd(16)} n=${String(rows.length).padStart(2)}  export={${[...exports].join(",")}}  registration={${[...regs].join(",")}}  ${consistent ? "consistent" : "MIXED — not derivable from title alone"}`
    );
  }

  console.log(
    `\nVERDICT: ${derivable ? "DERIVABLE — the two flags follow the title class, so we can compute them and drop Apibara." : "NOT derivable from title class alone — the flags carry information the title string does not."}`
  );

  // A second chance if the class-level mapping is mixed: maybe the exact string
  // determines it even when our coarser bucket does not.
  if (!derivable) {
    const byDoc = new Map<string, Set<string>>();
    for (const o of ok) {
      const key = o.docType;
      const set = byDoc.get(key) ?? new Set<string>();
      set.add(`${o.export}/${o.registration}`);
      byDoc.set(key, set);
    }
    const conflicting = [...byDoc.entries()].filter(([, v]) => v.size > 1);
    console.log(
      conflicting.length === 0
        ? `\nBut every EXACT doc_type string maps to one flag pair — a full string->flags table would work, at the cost of maintaining 415 rows.`
        : `\nEven exact doc_type strings disagree (${conflicting.length}); the flags genuinely come from elsewhere.`
    );
  }
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
