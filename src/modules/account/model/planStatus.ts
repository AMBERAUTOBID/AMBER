import { isPlanKey, PLANS, PLAN_KEYS, type PlanKey } from "@/modules/plans/model/plans";
import { ledgerFor, pendingDepositFor, planChangeFor } from "@/modules/plans/model/deposits";
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
  /** Money we are holding for them, USD cents. Zero on the free tier. */
  heldCents: number;
  /**
   * They have asked for the deposit back and an admin hasn't paid it yet. The
   * plan still works meanwhile — nothing has moved.
   */
  refundPending: boolean;
  /**
   * Tiers they could move up to, with what each would cost them **today**:
   * the catalogue price minus what we already hold.
   *
   * Computed here rather than in the page so the figure on the button, the
   * figure in the dialog and the row `requestPlan` writes all come from one
   * subtraction. A page doing its own arithmetic is how a client ends up
   * quoted one number and invoiced another.
   */
  upgrades: { planKey: PlanKey; amountCents: number }[];
}

export async function planStatusFor(user: SessionUser): Promise<PlanStatus> {
  // Validated rather than trusted: activePlanKey is a plain text column, and
  // a plan removed from the catalogue would otherwise crash the page trying
  // to translate a key that no longer has a name.
  const active = user.activePlanKey && isPlanKey(user.activePlanKey) ? user.activePlanKey : null;

  const [deposit, ledger] = await Promise.all([pendingDepositFor(user.id), ledgerFor(user.id)]);
  const pending =
    deposit && isPlanKey(deposit.planKey)
      ? {
          depositId: deposit.id,
          planKey: deposit.planKey,
          amountCents: deposit.amountCents,
          requestedAt: deposit.createdAt,
        }
      : null;

  const upgrades = PLAN_KEYS.flatMap((key) => {
    if (!PLANS[key].available) return [];
    const change = planChangeFor(PLANS[key].depositUsdCents, ledger);
    // `first` never appears here: this list is only ever read by a client who
    // already holds something. Matched explicitly anyway rather than by
    // elimination, so a fourth kind added later fails loudly instead of being
    // silently offered as an upgrade.
    return change.kind === "top_up" ? [{ planKey: key, amountCents: change.amountCents }] : [];
  });

  return {
    active,
    pending,
    heldCents: ledger.heldCents,
    refundPending: ledger.refundPending,
    upgrades,
  };
}
