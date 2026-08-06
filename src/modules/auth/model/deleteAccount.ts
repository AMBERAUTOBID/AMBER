/**
 * Erasing an account — GDPR Art. 17, the right to be forgotten.
 *
 * **The row is anonymised, not deleted.** `deposits.user_id` and
 * `action_tokens.user_id` cascade, so a real `DELETE FROM users` would take
 * the financial history with it: every record that a person paid us money,
 * how much, and when. Art. 17(3) explicitly permits retaining what a legal
 * obligation requires, and accounting records are the textbook example. So
 * the personal data goes and the money trail stays, unlinked from a name.
 *
 * What is erased:
 *   name          → a fixed placeholder
 *   email         → a unique non-identifying address (see below)
 *   phone         → null
 *   passwordHash  → a value no password can ever match
 *   activePlanKey → null; an erased account holds nothing
 *   sessions      → deleted outright, so access stops immediately
 *   action_tokens → deleted, so no emailed reset link can resurrect it
 *
 * What survives: deposit rows with their amounts, statuses and dates, and the
 * audit log. Neither names the person any more.
 *
 * **The email is replaced rather than nulled**, and that is doing two jobs.
 * The column is NOT NULL with a unique index, so it needs *a* value; and
 * making that value unique per user frees the person's real address, letting
 * them register again later if they choose. An erasure that permanently
 * locked them out of ever using the site again would be a strange reading of
 * a privacy right.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";

/** Not a valid scrypt hash — `verifyPassword` rejects the format outright, so
 * no password, correct or otherwise, can ever match it. */
const UNUSABLE_PASSWORD = "deleted";

/** Reserved TLD (RFC 2606). Can never route mail to a real inbox. */
const ERASED_EMAIL_DOMAIN = "deleted.invalid";

/** Shown wherever a deleted user's name would have appeared. Not translated:
 * it lands in database rows read by staff, not in a page. */
export const ERASED_NAME = "Deleted user";

export type DeleteAccountResult = "deleted" | "not_found";

/**
 * Erases a user. Idempotent: an already-erased account reports `not_found`,
 * because from the outside it no longer exists.
 *
 * `actorId` is who performed it — the user themselves, or an admin acting on
 * a request. Recorded in the audit log, which is the one place the fact of
 * the erasure survives.
 */
export async function deleteAccount(
  userId: string,
  actorId: string
): Promise<DeleteAccountResult> {
  // Claims the row atomically. Guarded on deletedAt being null so two
  // concurrent requests can't both "succeed", and so a second attempt can't
  // overwrite the original erasure timestamp.
  const claimed = await db()
    .update(schema.users)
    .set({
      name: ERASED_NAME,
      email: sql`${userId} || '@' || ${ERASED_EMAIL_DOMAIN}`,
      phone: null,
      passwordHash: UNUSABLE_PASSWORD,
      activePlanKey: null,
      deletedAt: new Date(),
    })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .returning({ id: schema.users.id });

  if (!claimed[0]) return "not_found";

  // After the update, never before: if these ran first and the update then
  // failed, we would have signed someone out of an account they still have.
  await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await db().delete(schema.actionTokens).where(eq(schema.actionTokens.userId, userId));
  // Saved cars go too (2026-08-06 audit finding — they survived erasure).
  // Which vehicles a person was watching is their personal data, and unlike
  // the deposit rows there is no accounting duty to keep it. Deleted
  // outright, not anonymised: an unowned favourite means nothing.
  await db().delete(schema.favorites).where(eq(schema.favorites.userId, userId));

  // Any open request dies with the account. Found by testing: without this,
  // an erased user's pending deposit stayed in the admin queue as a row
  // labelled "Deleted user" — and confirming it would have activated a plan
  // on an account that no longer exists. Cancelled rather than deleted, for
  // the same reason as everything else here: the record that a request was
  // made survives, the person it belonged to does not.
  await db()
    .update(schema.deposits)
    .set({ status: "cancelled" })
    .where(and(eq(schema.deposits.userId, userId), eq(schema.deposits.status, "pending")));

  // Deliberately records no personal data — an audit trail of erasures that
  // preserved the erased details would defeat the point. Who did it and when
  // is the whole content.
  try {
    await db().insert(schema.auditLog).values({
      actorId,
      action: "account.deleted",
      targetType: "user",
      targetId: userId,
      detail: { selfService: actorId === userId },
    });
  } catch (e) {
    console.error("[audit] failed to record account.deleted", e);
  }

  return "deleted";
}
