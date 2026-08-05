/**
 * Session lifecycle: create on login, look up on every authenticated
 * request, destroy on logout — with absolute expiry and sliding renewal.
 *
 * This is the module the "DB rows, not JWTs" decision (ARCHITECTURE.md §6)
 * lives in. Deleting a row here IS revocation; nothing else needs to happen
 * anywhere for a user to be locked out.
 */
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import { db, schema } from "@/shared/db/client";
import { generateToken, hashToken } from "./token";

export const SESSION_COOKIE = "smartautobid-session";
/** 30 days absolute; renewed (slid forward) when less than half remains. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "client" | "admin";
  locale: string;
  emailVerified: boolean;
  activePlanKey: string | null;
  selfBiddingGranted: boolean;
}

/** Creates the DB row and returns the raw token destined for the cookie. */
export async function createSession(
  userId: string,
  context: { userAgent?: string; ip?: string } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().insert(schema.sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    userAgent: context.userAgent?.slice(0, 400),
    ip: context.ip?.slice(0, 100),
  });
  return { token, expiresAt };
}

/**
 * Resolves a cookie token to the user it belongs to, or null. Expired rows
 * are treated as absent — cleanup happens opportunistically (see below)
 * rather than via a scheduled job the project doesn't need yet.
 */
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const rows = await db()
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      locale: schema.users.locale,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      activePlanKey: schema.users.activePlanKey,
      selfBiddingGrantedAt: schema.users.selfBiddingGrantedAt,
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date()))
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Sliding renewal: extend the row once it is past half-life, so active
  // users never get logged out mid-use but abandoned sessions still die.
  if (row.expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
    await db()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(schema.sessions.id, row.sessionId));
  }

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: row.locale,
    emailVerified: row.emailVerifiedAt !== null,
    activePlanKey: row.activePlanKey,
    selfBiddingGranted: row.selfBiddingGrantedAt !== null,
  };
}

export async function destroySession(token: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
}

/** Revocation lever for admin actions (freeze account, withdraw deposit). */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/**
 * "Sign out everywhere else" — every session except the one asking.
 *
 * Distinct from destroyAllSessionsForUser because the two answer different
 * questions. That one is used when the credentials themselves are suspect and
 * *everything* must go. This one is the client saying "I don't recognise that
 * device", where logging them out of the browser they're using to fix the
 * problem would be a strange way to help.
 *
 * Returns how many were killed, so the UI can say something true.
 */
export async function destroyOtherSessionsForUser(
  userId: string,
  currentToken: string
): Promise<number> {
  const gone = await db()
    .delete(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        ne(schema.sessions.tokenHash, hashToken(currentToken))
      )
    )
    .returning({ id: schema.sessions.id });
  return gone.length;
}

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  /** The browser making this request. */
  current: boolean;
}

/**
 * The signed-in devices list. Expired rows are excluded rather than shown as
 * dead entries — a session that can't log anyone in isn't a device the client
 * needs to make a decision about.
 *
 * There is no "last active" column and this deliberately doesn't invent one.
 * `expiresAt` slides forward only once a session is past half-life, so
 * deriving activity from it would be wrong by up to fifteen days. The honest
 * fact we hold is when the session started.
 */
export async function listSessionsForUser(
  userId: string,
  currentToken: string | null
): Promise<SessionRow[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const rows = await db()
    .select({
      id: schema.sessions.id,
      tokenHash: schema.sessions.tokenHash,
      userAgent: schema.sessions.userAgent,
      ip: schema.sessions.ip,
      createdAt: schema.sessions.createdAt,
    })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.createdAt));

  return rows.map(({ tokenHash, ...row }) => ({
    ...row,
    current: currentHash !== null && tokenHash === currentHash,
  }));
}

/**
 * Called opportunistically from login (a write moment that already exists).
 * Deleting expired rows keeps the table small without a cron dependency.
 */
export async function pruneExpiredSessions(): Promise<void> {
  await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}
