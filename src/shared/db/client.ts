/**
 * The one database client. Every query in the app goes through `db()`.
 *
 * Driver choice: Neon's HTTP driver rather than a TCP pool. Each Vercel
 * function invocation is short-lived and isolated, so classic connection
 * pooling has nothing to reuse and exhausted-connection incidents are the
 * classic serverless-Postgres failure. Neon's driver speaks SQL over
 * fetch(), which needs no pool and cannot leak connections — and works
 * identically in local dev.
 *
 * Lazily constructed so that merely importing this module (e.g. from a page
 * that renders statically at build time) does not demand DATABASE_URL. The
 * error therefore fires on first *query*, naming the actual problem, instead
 * of crashing every build where the variable is absent — the same pattern the
 * Apibara client uses for its key.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let instance: NeonHttpDatabase<typeof schema> | null = null;

export function db(): NeonHttpDatabase<typeof schema> {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Locally: add it to .env.local (value from the Neon quickstart or Vercel env vars). On Vercel it is injected by the Neon integration."
    );
  }
  instance = drizzle(neon(url), { schema });
  return instance;
}

let auctionInstance: NeonHttpDatabase<typeof schema> | null = null;

/**
 * The mirrored auction catalogue, which is a DIFFERENT database from `db()`.
 *
 * WHY THIS EXISTS. `postgresSource` used to query `db()`, so serving search
 * from the mirror would have meant pointing `DATABASE_URL` at the mirror
 * branch — and that is the whole application, not just search. Client
 * accounts, sessions, deposits, favourites and orders would have been read
 * from, and written to, a copy. The two were already diverging when this was
 * found: the mirror held a `vehicle_orders` row production did not. One env
 * var away from a split nobody could have merged back.
 *
 * So the catalogue gets its own connection. Search reads `auctionDb()`;
 * everything a customer owns stays on `db()`, whatever either points at.
 *
 * SEPARATE COMPUTE IS THE SECOND REASON. A full sweep saturates a 0.25 CU
 * Neon endpoint for ~2.5 hours. Sharing one endpoint means the customer-
 * facing site crawls every night; on its own, the sweep is invisible.
 *
 * FALLS BACK TO `DATABASE_URL` ON PURPOSE. Unset — which is every environment
 * today — this returns exactly what `db()` returns, so nothing changes until
 * the variable is deliberately set. `scripts/dev-mirror.mjs` keeps working
 * untouched: it points DATABASE_URL at the mirror and both clients follow.
 * The fallback is also the right answer for anyone genuinely running one
 * database.
 */
export function auctionDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.DATABASE_URL_AUCTION;
  if (!url) return db();
  if (auctionInstance) return auctionInstance;
  auctionInstance = drizzle(neon(url), { schema });
  return auctionInstance;
}

export { schema };
