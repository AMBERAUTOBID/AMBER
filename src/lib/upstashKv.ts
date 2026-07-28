/**
 * Minimal Upstash Redis REST client (plain fetch, no SDK dependency) -
 * shared between the Next.js Telegram webhook (src/app/api/telegram/webhook)
 * and the standalone GitHub Actions bot script (scripts/telegram-bot), which
 * is exactly why this lives here rather than using `@vercel/kv`: that
 * package assumes a Next.js/Vercel runtime, but the bot script runs as a
 * plain Node process outside Next entirely. Upstash's REST API works
 * identically from both contexts over HTTPS, so one small client covers
 * both callers.
 *
 * Provisioned via Vercel's KV integration (Storage tab -> KV, powered by
 * Upstash) - that sets KV_REST_API_URL / KV_REST_API_TOKEN automatically on
 * the Vercel project. The bot script needs the same two values added as
 * GitHub Actions secrets (see scripts/telegram-bot/README.md).
 */

function restUrl(): string {
  const url = process.env.KV_REST_API_URL;
  if (!url) throw new Error("KV_REST_API_URL is not set.");
  return url;
}

function restToken(): string {
  const token = process.env.KV_REST_API_TOKEN;
  if (!token) throw new Error("KV_REST_API_TOKEN is not set.");
  return token;
}

async function command<T>(parts: (string | number)[]): Promise<T> {
  const path = parts.map((p) => encodeURIComponent(String(p))).join("/");
  const res = await fetch(`${restUrl()}/${path}`, {
    headers: { Authorization: `Bearer ${restToken()}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upstash request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

/** Stores a JSON-serializable value under `key`, expiring after `exSeconds`. */
export async function kvSetJson(key: string, value: unknown, exSeconds: number): Promise<void> {
  await command(["set", key, JSON.stringify(value), "EX", exSeconds]);
}

/** Returns the parsed JSON value for `key`, or null if it doesn't exist. */
export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await command<string | null>(["get", key]);
  if (raw === null || raw === undefined) return null;
  return JSON.parse(raw) as T;
}
