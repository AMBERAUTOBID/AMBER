import { db, schema } from "./client";

/**
 * The one way to write `audit_log`.
 *
 * It existed twice, verbatim, in `modules/plans/model/deposits.ts` and
 * `modules/admin/model/maintenance.ts`, and authentication was about to make
 * it three. Two copies of a three-line helper is tolerable; three copies of a
 * helper whose whole contract is "never throw" is how one of them eventually
 * loses the try/catch and takes a money operation down with it.
 *
 * **Never fatal, by contract.** Every caller here is reporting something that
 * has already happened — a deposit confirmed, a password changed, a session
 * created. A lost log line is bad; an exception that unwinds the operation it
 * was describing is worse, and would leave the system in a state nobody
 * intended precisely because the *record-keeping* failed.
 *
 * **Always awaited by callers, never fired and forgotten.** This runs on a
 * platform that may freeze the function the moment a response is sent, so a
 * dangling promise is a log line that silently never happens.
 */
export async function recordAudit(
  /** Who did it. Null = the system, or an actor whose account is gone. */
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  detail?: unknown
): Promise<void> {
  try {
    await db()
      .insert(schema.auditLog)
      .values({ actorId, action, targetType, targetId, detail });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
