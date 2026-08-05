/**
 * The password rule, in a module the browser can import.
 *
 * Split out of `password.ts` because that file imports `node:crypto` for
 * scrypt, and a client component importing a constant from it drags the whole
 * hashing implementation into the browser bundle — where `promisify(scrypt)`
 * throws at module load and takes the page down with it. Found exactly that
 * way: the change-password form crashed on load with `The "original" argument
 * must be of type Function`.
 *
 * So: no imports here, ever. `password.ts` re-exports both names, so
 * server-side callers are unaffected.
 *
 * Deliberately just a length rule. Composition rules ("one uppercase, one
 * symbol") are security theater per NIST 800-63B; length is the only factor
 * that reliably matters.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= 200;
}
