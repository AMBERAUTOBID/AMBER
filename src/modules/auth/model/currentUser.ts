/**
 * The one way server components and route handlers learn who is asking.
 *
 * Reads the session cookie and resolves it against the sessions table —
 * i.e. real authentication on every request, per the rule in proxy.ts's
 * sibling decision (ARCHITECTURE.md §7): the middleware gate is optimistic
 * chrome; THIS is the check security relies on.
 */
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "./session";

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await getSessionUser(token);
  } catch (e) {
    // A DB hiccup must read as "not logged in", never as a crashed page.
    console.error("[auth] session lookup failed:", e);
    return null;
  }
}
