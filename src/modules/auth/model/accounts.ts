/**
 * Account lifecycle: register, login, email verification, password reset.
 *
 * Every function returns a discriminated result instead of throwing for
 * expected outcomes — the API routes translate results to HTTP shapes, and
 * "wrong password" is not an exception, it's Tuesday.
 *
 * Two security behaviors are deliberate and must survive refactors:
 *
 * 1. Login failure is one answer. "No such account" and "wrong password"
 *    both return invalid_credentials, and we ALWAYS verify against a hash
 *    (a decoy for unknown emails) so the two paths cost the same time —
 *    otherwise response timing enumerates registered emails.
 *
 * 2. Registration and reset don't reveal whether an email exists either.
 *    Registering a taken email reports ok and we email the existing owner
 *    instead; reset always reports ok. The inbox is the only place that
 *    knows the truth, and only its owner can read it.
 */
import { eq, sql, and, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { hashPassword, verifyPassword, passwordMeetsPolicy } from "./password";
import { generateToken, hashToken } from "./token";
import { createSession, pruneExpiredSessions, destroyAllSessionsForUser } from "./session";

/** Hash of a random password nobody knows — verified against for unknown
 * emails so login timing doesn't depend on whether the account exists. */
const DECOY_HASH_PROMISE = hashPassword(generateToken());

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface NewAccount {
  email: string;
  password: string;
  name: string;
  phone?: string;
  locale: string;
}

export type RegisterResult =
  | { status: "created"; userId: string; verifyToken: string }
  /** Email already registered — caller reports success either way (see top). */
  | { status: "exists"; existingEmail: string }
  | { status: "invalid"; field: "email" | "password" | "name" };

export async function registerAccount(input: NewAccount): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) return { status: "invalid", field: "email" };
  if (!name || name.length > 200) return { status: "invalid", field: "name" };
  if (!passwordMeetsPolicy(input.password)) return { status: "invalid", field: "password" };

  const passwordHash = await hashPassword(input.password);

  const inserted = await db()
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      name,
      phone: input.phone?.trim().slice(0, 50) || null,
      locale: ["en", "ru", "lt"].includes(input.locale) ? input.locale : "en",
    })
    // The unique index is on lower(email); a duplicate insert is the ONE
    // authoritative existence check, so registration has no separate
    // select-then-insert race window.
    .onConflictDoNothing()
    .returning({ id: schema.users.id });

  const row = inserted[0];
  if (!row) return { status: "exists", existingEmail: email };

  const verifyToken = await issueActionToken(row.id, "verify_email", VERIFY_TTL_MS);
  return { status: "created", userId: row.id, verifyToken };
}

export type LoginResult =
  | { status: "ok"; sessionToken: string; expiresAt: Date }
  | { status: "invalid_credentials" }
  | { status: "email_not_verified" };

export async function loginAccount(
  emailRaw: string,
  password: string,
  context: { userAgent?: string; ip?: string }
): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const rows = await db()
    .select({
      id: schema.users.id,
      passwordHash: schema.users.passwordHash,
      emailVerifiedAt: schema.users.emailVerifiedAt,
    })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  const user = rows[0];
  // Unknown email still burns a full hash verification — see file header.
  const hashToCheck = user?.passwordHash ?? (await DECOY_HASH_PROMISE);
  const passwordOk = await verifyPassword(password, hashToCheck);
  if (!user || !passwordOk) return { status: "invalid_credentials" };

  // Verification gates login outright: an unverified account can't do
  // anything a plan governs anyway (can() denies first on email), and
  // blocking here keeps half-real accounts out of the session table.
  if (!user.emailVerifiedAt) return { status: "email_not_verified" };

  await pruneExpiredSessions();
  const session = await createSession(user.id, context);
  return { status: "ok", sessionToken: session.token, expiresAt: session.expiresAt };
}

export type VerifyEmailResult = "verified" | "invalid_or_expired";

export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  const row = await consumeActionToken(token, "verify_email");
  if (!row) return "invalid_or_expired";
  await db()
    .update(schema.users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(schema.users.id, row.userId));
  return "verified";
}

/** Always resolves; whether an email went out is intentionally not revealed. */
export async function requestPasswordReset(
  emailRaw: string
): Promise<{ resetToken: string; userId: string; email: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  const rows = await db()
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);
  const user = rows[0];
  if (!user) return null;
  const resetToken = await issueActionToken(user.id, "reset_password", RESET_TTL_MS);
  return { resetToken, userId: user.id, email: user.email };
}

export type ResetPasswordResult = "reset" | "invalid_or_expired" | "weak_password";

export async function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
  if (!passwordMeetsPolicy(newPassword)) return "weak_password";
  const row = await consumeActionToken(token, "reset_password");
  if (!row) return "invalid_or_expired";

  await db()
    .update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(schema.users.id, row.userId));
  // A reset proves the old credentials may be compromised — every existing
  // session dies with them.
  await destroyAllSessionsForUser(row.userId);
  return "reset";
}

async function issueActionToken(
  userId: string,
  purpose: "verify_email" | "reset_password",
  ttlMs: number
): Promise<string> {
  const token = generateToken();
  await db().insert(schema.actionTokens).values({
    tokenHash: hashToken(token),
    userId,
    purpose,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/** Single-use enforcement: the UPDATE claims the token atomically — two
 * concurrent submissions of the same link can't both succeed. */
async function consumeActionToken(
  token: string,
  purpose: "verify_email" | "reset_password"
): Promise<{ userId: string } | null> {
  const rows = await db()
    .update(schema.actionTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.actionTokens.tokenHash, hashToken(token)),
        eq(schema.actionTokens.purpose, purpose),
        isNull(schema.actionTokens.usedAt),
        gt(schema.actionTokens.expiresAt, new Date())
      )
    )
    .returning({ userId: schema.actionTokens.userId });
  return rows[0] ?? null;
}
