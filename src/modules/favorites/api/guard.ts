import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/model/currentUser";
import { can } from "@/modules/plans/model/can";
import type { PlanKey } from "@/modules/plans/model/plans";
import type { SessionUser } from "@/modules/auth/model/session";

// Re-exported for the favorites routes; the definition lives in shared/validation.
export { UUID } from "@/shared/validation";

type Guarded =
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse };

/**
 * A session, and nothing more.
 *
 * This is the gate for **listing and removing**. Losing a plan must not lock
 * someone out of the cars they already collected, or leave them unable to
 * tidy up a list they can see — "read-only" in the agreed design means they
 * keep and can prune what is theirs, not that it turns to stone.
 */
export async function requireOwner(): Promise<Guarded> {
  const user = await currentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }),
    };
  }
  return { user, error: null };
}

/**
 * A session **and an active plan**. The gate for the two actions that
 * consume something: saving a new car, and refreshing one against Apibara.
 *
 * Refresh is on this side of the line rather than counted as reading,
 * because it pulls *new* upstream data and spends quota the Telegram bot
 * shares. Reading a stored snapshot costs nothing; asking the auction site
 * again does.
 *
 * One function so the routes cannot drift apart — the same reasoning that
 * produced `currentAdmin()`.
 */
export async function requireSaver(): Promise<Guarded> {
  const { user, error } = await requireOwner();
  if (error) return { user: null, error };

  // Server-side, on every request, regardless of what the UI already decided
  // — a client that skips the UI skips nothing.
  const decision = can(
    {
      role: user.role,
      emailVerified: user.emailVerified,
      activePlanKey: user.activePlanKey as PlanKey | null,
      selfBiddingGranted: user.selfBiddingGranted,
    },
    { type: "save_favorite" }
  );

  if (!decision.allowed) {
    // The machine-readable reason is passed through so the UI can say
    // "choose a plan" rather than a generic refusal.
    return {
      user: null,
      error: NextResponse.json({ ok: false, error: decision.reason }, { status: 403 }),
    };
  }

  return { user, error: null };
}
