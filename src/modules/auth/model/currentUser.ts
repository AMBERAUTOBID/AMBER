/**
 * The one way server components and route handlers learn who is asking.
 *
 * Reads the session cookie and resolves it against the sessions table —
 * i.e. real authentication on every request, per the rule in proxy.ts's
 * sibling decision (ARCHITECTURE.md §7): the middleware gate is optimistic
 * chrome; THIS is the check security relies on.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "./session";

/**
 * Deduplicated per request with React's `cache`. The account area has a
 * layout and a page that both need the user — without this, every account
 * page costs two identical session queries. Callers get the same object.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await getSessionUser(token);
  } catch (e) {
    // A DB hiccup must read as "not logged in", never as a crashed page.
    console.error("[auth] session lookup failed:", e);
    return null;
  }
});
