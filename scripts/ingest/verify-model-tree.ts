/**
 * Runs the model grouping over the WHOLE catalogue, not a fixture.
 *
 * The unit tests prove the rules on twenty hand-picked rows; this proves the
 * two properties that matter over all 5,263 make/model pairs: nothing is lost,
 * and no group swallowed a car that is not in it. Read-only.
 */
import { neon } from "@neondatabase/serverless";
import { auctionDbUrl, AUCTION_DB_URL_MISSING } from "./auctionDbUrl";
import { buildModelTree, type RawModelCount } from "../../src/modules/inventory/model/modelTree";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const url = auctionDbUrl({ unpooled: false });

if (!url) {
  console.error(AUCTION_DB_URL_MISSING);
  process.exit(1);
}
if (url.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const sql = neon(url);

async function main() {
  const rows = (await sql.query(`
    select upper(make) as make, model, count(*)::int as n
    from auction_lots
    where make is not null and model is not null and auction_name not ilike '%CANADA%'
    group by 1, 2
  `)) as unknown as Array<{ make: string; model: string; n: number }>;

  const byMake = new Map<string, RawModelCount[]>();
  for (const r of rows) {
    const list = byMake.get(r.make) ?? [];
    list.push({ model: r.model, count: r.n });
    byMake.set(r.make, list);
  }

  let pairs = 0;
  let lots = 0;
  let reachedPairs = 0;
  let reachedLots = 0;
  let groups = 0;
  let grouped = 0;
  const deepest: Array<{ make: string; label: string; kids: number; count: number }> = [];

  for (const [make, list] of byMake) {
    const tree = buildModelTree(list);
    const reachable = new Set(tree.flatMap((g) => g.models));
    pairs += list.length;
    lots += list.reduce((a, r) => a + r.count, 0);
    for (const r of list) {
      if (reachable.has(r.model)) {
        reachedPairs++;
        reachedLots += r.count;
      } else {
        console.log(`  LOST: ${make} / ${r.model} (${r.count})`);
      }
    }
    groups += tree.length;
    for (const g of tree) {
      if (g.children.length > 0) {
        grouped++;
        deepest.push({ make, label: g.label, kids: g.children.length, count: g.count });
      }
    }
  }

  console.log(`makes            ${byMake.size.toLocaleString()}`);
  console.log(`model strings    ${pairs.toLocaleString()}  →  rows shown ${groups.toLocaleString()}`);
  console.log(`families formed  ${grouped.toLocaleString()}`);
  console.log(`strings reached  ${reachedPairs.toLocaleString()} / ${pairs.toLocaleString()}`);
  console.log(`lots reached     ${reachedLots.toLocaleString()} / ${lots.toLocaleString()}`);

  console.log("\nthe twenty biggest families — eyeball these for a wrong parent");
  deepest.sort((a, b) => b.count - a.count);
  for (const d of deepest.slice(0, 20)) {
    console.log(`  ${d.make.padEnd(16)} ${d.label.padEnd(18)} ${String(d.kids).padStart(3)} models  ${d.count}`);
  }

  console.log("\nBMW and MERCEDES-BENZ, in full-ish");
  for (const make of ["BMW", "MERCEDES-BENZ"]) {
    const tree = buildModelTree(byMake.get(make) ?? []);
    console.log(`\n${make} — ${tree.length} rows`);
    for (const g of tree.slice(0, 12)) {
      console.log(`  ${g.label} (${g.count})${g.children.length ? " ▾" : ""}`);
      for (const c of g.children.slice(0, 8)) console.log(`      ${c.label} (${c.count})`);
      if (g.children.length > 8) console.log(`      … ${g.children.length - 8} more`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
