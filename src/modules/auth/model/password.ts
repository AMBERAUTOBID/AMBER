/**
 * Password hashing — scrypt via node:crypto.
 *
 * Why scrypt and not argon2: argon2 in Node means a native-compiled
 * dependency, which is exactly the kind of thing that builds fine locally
 * and fails on a serverless platform's build image. scrypt ships inside
 * Node itself (nothing to install, nothing to compile), is OWASP-listed for
 * password storage, and at these parameters is far beyond brute-force reach.
 * The stored format is self-describing so parameters can be raised later
 * without invalidating existing hashes.
 *
 * Format: scrypt$N$r$p$salt_b64$hash_b64
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Re-exported so server-side callers keep one import. Client components must
// import from passwordPolicy directly — see the warning in that file; pulling
// it through here would bundle node:crypto into the browser.
export { MIN_PASSWORD_LENGTH, passwordMeetsPolicy } from "./passwordPolicy";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/** OWASP-recommended scrypt work factors (N=2^17, r=8, p=1). */
const N = 131072;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** scrypt needs 128*N*r bytes; default maxmem (32MB) is too small for N=2^17. */
const MAX_MEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM,
  });
  // timingSafeEqual, not equals(): a byte-by-byte compare that bails early
  // would let response timing leak how much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

