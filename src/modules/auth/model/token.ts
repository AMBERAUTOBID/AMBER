/**
 * Opaque tokens for sessions, email verification, and password resets.
 *
 * The rule (established in shared/db/schema.ts): the browser cookie or the
 * emailed link carries the random token; the database stores only its
 * SHA-256. Neither a database dump nor a read-only SQL injection yields
 * anything that logs someone in — the stored hash cannot be turned back
 * into the cookie value.
 *
 * 256 bits of randomness makes guessing a token strictly harder than
 * guessing the session away, and SHA-256 (not scrypt) is correct here:
 * these tokens are high-entropy random strings, not human passwords, so
 * there is nothing for a slow hash to protect against.
 */
import { createHash, randomBytes } from "node:crypto";

/** base64url: cookie-safe and URL-safe without further encoding. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
