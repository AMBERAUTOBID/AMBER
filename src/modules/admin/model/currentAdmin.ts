import { currentUser } from "@/modules/auth/model/currentUser";
import { can } from "@/modules/plans/model/can";
import type { PlanKey } from "@/modules/plans/model/plans";
import type { SessionUser } from "@/modules/auth/model/session";

/**
 * "Is the caller an admin?" — the one place that decides.
 *
 * The `can()` block below was previously copy-pasted between the admin page
 * and the admin API route. That is exactly the shape of duplication that
 * rots: the console is going to grow more pages and more routes, and the
 * moment one of them forgets the `emailVerified` half of the check, there is
 * an admin surface guarded differently from the rest with nothing to flag it.
 *
 * **Every new admin page and route must go through this.** It returns null
 * rather than throwing so each layer can choose its own HTTP shape — pages
 * call `notFound()`, routes return a 404 body — while the decision itself
 * stays in one function that calls `can()`, still the only authorization
 * decision point (ARCHITECTURE.md §6).
 *
 * 404 everywhere, never 403 or a redirect to login: a redirect would tell a
 * curious client that /admin exists and is worth returning to with better
 * credentials. 404 says nothing at all.
 */
export async function currentAdmin(): Promise<SessionUser | null> {
  const user = await currentUser();
  if (!user) return null;

  const decision = can(
    {
      role: user.role,
      emailVerified: user.emailVerified,
      activePlanKey: user.activePlanKey as PlanKey | null,
      selfBiddingGranted: user.selfBiddingGranted,
    },
    { type: "access_admin" }
  );

  return decision.allowed ? user : null;
}
