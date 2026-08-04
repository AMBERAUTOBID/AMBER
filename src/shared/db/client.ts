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

export { schema };
