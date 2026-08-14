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
import { pruneStaleRateLimits } from "./rateLimit";
import { recordAudit } from "@/shared/db/audit";
import { purgeStaleActivity } from "@/modules/activity/model/events";

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

  // Deliberately records no email or name: the row those live on is right
  // there, and an audit log that duplicated them would survive the
  // anonymisation that erasure performs on `users` — defeating it.
  await recordAudit(row.id, "account.registered", "user", row.id, { locale: input.locale });

  const verifyToken = await issueActionToken(row.id, "verify_email", VERIFY_TTL_MS);
  return { status: "created", userId: row.id, verifyToken };
}

export type LoginResult =
  /** `role` rides along so the route can hand admins a maintenance-bypass
   * cookie without a second lookup. It is NOT part of the auth decision. */
  | { status: "ok"; sessionToken: string; expiresAt: Date; userId: string; role: "client" | "admin" }
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
      deletedAt: schema.users.deletedAt,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  const user = rows[0];
  // Unknown email still burns a full hash verification — see file header.
  const hashToCheck = user?.passwordHash ?? (await DECOY_HASH_PROMISE);
  const passwordOk = await verifyPassword(password, hashToCheck);
  if (!user || !passwordOk) {
    // A failed attempt is worth more than a successful one when something is
    // wrong, and it is the entry a client's history needs when they ring up
    // saying they cannot get in. The actor is null for an unknown email —
    // there is nobody to attribute it to — and **the address is not recorded
    // in that case**: writing every string somebody typed into the login box
    // would turn this table into a collection of other people's email
    // addresses, harvested from typos and probes.
    await recordAudit(user?.id ?? null, "auth.login_failed", "user", user?.id, {
      reason: "invalid_credentials",
      knownAccount: Boolean(user),
      ip: context.ip,
    });
    return { status: "invalid_credentials" };
  }

  // Belt and braces. An erased account's password hash is already a value no
  // password can match, and its email was rewritten so this lookup shouldn't
  // find it — but "shouldn't" is not a thing to leave authentication resting
  // on. Same undifferentiated answer as a wrong password: whether an account
  // was deleted is not something a stranger gets to learn.
  if (user.deletedAt) return { status: "invalid_credentials" };

  // Verification gates login outright: an unverified account can't do
  // anything a plan governs anyway (can() denies first on email), and
  // blocking here keeps half-real accounts out of the session table.
  if (!user.emailVerifiedAt) return { status: "email_not_verified" };

  // Three opportunistic cleanups on the same write moment: expired sessions,
  // rate-limit counters whose window lapsed over a day ago, and browsing
  // history past its retention window.
  //
  // Retention enforced from a login rather than a cron the project does not
  // have. That is sound here in a way it would not be for, say, financial
  // records: a site nobody logs into is also a site collecting nothing new,
  // so the backlog cannot grow while the purge is idle.
  await pruneExpiredSessions();
  await pruneStaleRateLimits();
  await purgeStaleActivity();
  const session = await createSession(user.id, context);
  await recordAudit(user.id, "auth.login", "user", user.id, {
    ip: context.ip,
    userAgent: context.userAgent?.slice(0, 200),
  });
  return {
    status: "ok",
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    userId: user.id,
    role: user.role,
  };
}

export type VerifyEmailResult = "verified" | "invalid_or_expired";

export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  const row = await consumeActionToken(token, "verify_email");
  if (!row) return "invalid_or_expired";
  await db()
    .update(schema.users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(schema.users.id, row.userId));
  await recordAudit(row.userId, "auth.email_verified", "user", row.userId);
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
  // The *request*, recorded separately from the reset itself, because they are
  // different facts: a run of requests with no reset following them is
  // somebody else trying to get in, and only the pair tells that story.
  await recordAudit(user.id, "auth.reset_requested", "user", user.id);
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
  await recordAudit(row.userId, "auth.password_reset", "user", row.userId);
  return "reset";
}

export interface ProfileUpdate {
  name: string;
  phone: string;
  /** Which language this account's emails are written in. */
  locale: string;
}

export type UpdateProfileResult =
  | { status: "updated" }
  | { status: "invalid"; field: "name" | "phone" };

/**
 * The client edits their own details.
 *
 * Email is deliberately NOT editable here. Changing it means re-proving
 * ownership of the new address, and an unverified change would either lock
 * someone out of their own password reset or hand their account to whoever
 * typed the address — that is a verification flow, not a form field, and it
 * belongs with the work that needs it.
 *
 * Nothing sensitive is collected either (ARCHITECTURE.md §6a): no national
 * identity number, no IBAN. Both would change our GDPR obligations
 * materially, and neither is needed until invoices are actually issued.
 */
export async function updateProfile(
  userId: string,
  input: ProfileUpdate
): Promise<UpdateProfileResult> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > 200) return { status: "invalid", field: "name" };

  const phone = input.phone.replace(/\s+/g, " ").trim();
  // Loose on purpose. These are international numbers written however the
  // owner writes them, and a strict pattern would reject valid ones — the
  // only thing that matters is that a human can dial what is stored.
  if (phone.length > 50) return { status: "invalid", field: "phone" };

  await db()
    .update(schema.users)
    .set({
      name,
      phone: phone || null,
      locale: ["en", "ru", "lt"].includes(input.locale) ? input.locale : "en",
    })
    .where(eq(schema.users.id, userId));

  // Which fields changed, never their values. The new name and phone live on
  // the user row; copying them here would leave a shadow of exactly the
  // personal data erasure scrubs from that row, in a table erasure must not
  // touch.
  await recordAudit(userId, "account.profile_updated", "user", userId, {
    fields: ["name", "phone", "locale"],
  });
  return { status: "updated" };
}

export type ChangePasswordResult =
  | { status: "changed"; sessionToken: string; expiresAt: Date }
  | { status: "invalid_current" }
  | { status: "weak_password" };

/**
 * Change password while signed in. Requires the current one — a session left
 * open on a shared machine must not be enough to take the account over.
 *
 * Every session dies, including this browser's, for the same reason
 * resetPassword kills them: if the old password leaked, whoever has it is
 * probably signed in somewhere. A fresh session is then issued for the
 * browser that made the change, so the person doing the right thing isn't
 * punished by being logged out — the caller must set the returned cookie.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context: { userAgent?: string; ip?: string }
): Promise<ChangePasswordResult> {
  const rows = await db()
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(currentPassword, stored))) {
    return { status: "invalid_current" };
  }
  // Checked after the current password, so a stranger poking at the endpoint
  // learns nothing about our policy without valid credentials.
  if (!passwordMeetsPolicy(newPassword)) return { status: "weak_password" };

  await db()
    .update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(schema.users.id, userId));

  await destroyAllSessionsForUser(userId);
  const session = await createSession(userId, context);
  await recordAudit(userId, "auth.password_changed", "user", userId, { ip: context.ip });
  return { status: "changed", sessionToken: session.token, expiresAt: session.expiresAt };
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
