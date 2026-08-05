import { isPlanKey, type PlanKey } from "@/modules/plans/model/plans";
import { pendingDepositFor } from "@/modules/plans/model/deposits";
import type { SessionUser } from "@/modules/auth/model/session";

/**
 * Two independent facts, not one state machine — which is the point of the
 * shape. A client with a confirmed Bronze plan may well have an open request
 * for Silver, and a UI that models this as a single enum has to pick one of
 * those to hide. Both are true; the pages decide what to show.
 */
export interface PlanStatus {
  /** The plan they hold now. Null = registered, nothing active. */
  active: PlanKey | null;
  /** An undecided request. At most one exists (see requestPlan). */
  pending: {
    depositId: string;
    planKey: PlanKey;
    amountCents: number;
    requestedAt: Date;
  } | null;
}

export async function planStatusFor(user: SessionUser): Promise<PlanStatus> {
  // Validated rather than trusted: activePlanKey is a plain text column, and
  // a plan removed from the catalogue would otherwise crash the page trying
  // to translate a key that no longer has a name.
  const active = user.activePlanKey && isPlanKey(user.activePlanKey) ? user.activePlanKey : null;

  const deposit = await pendingDepositFor(user.id);
  const pending =
    deposit && isPlanKey(deposit.planKey)
      ? {
          depositId: deposit.id,
          planKey: deposit.planKey,
          amountCents: deposit.amountCents,
          requestedAt: deposit.createdAt,
        }
      : null;

  return { active, pending };
}
