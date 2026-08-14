import { planChangeFor, type Ledger } from "./deposits";
import type { Plan, PlanKey } from "./plans";

/**
 * What a single plan card can offer *this* visitor.
 *
 * Decided on the server and handed to the card, rather than worked out in the
 * component, for one reason: the amount shown on the button has to be the
 * amount `requestPlan` writes to the deposit row. Both now come from
 * `planChangeFor`, so a card can no longer quote a price the server disagrees
 * with — the same rule `planFeatures` enforces for feature lines.
 */
export type CardState =
  /** Nobody is signed in; the button sends them to register. */
  | { kind: "signed_out" }
  /** Nothing held: they would pay this tier's deposit in full. */
  | { kind: "select"; amountCents: number }
  /** They hold a cheaper tier: this is the difference, and only the difference. */
  | { kind: "upgrade"; amountCents: number }
  /** The tier they are on. */
  | { kind: "current" }
  /**
   * At or below what they already hold. Not offered, because there is no
   * self-service downgrade — see planChangeFor for why that is the design and
   * not an omission.
   */
  | { kind: "lower" }
  /** They asked for their deposit back; tier changes wait for that to settle. */
  | { kind: "refund_pending" };

export function cardStateFor(
  plan: Plan,
  /** Null when signed out. */
  ledger: Ledger | null,
  activePlanKey: PlanKey | null
): CardState {
  if (!ledger) return { kind: "signed_out" };
  // Checked before anything else: while a refund is open, every tier is
  // equally unavailable, including the one they are on — and saying so once
  // is clearer than a row of cards each disabled for its own reason.
  if (ledger.refundPending) return { kind: "refund_pending" };
  if (activePlanKey === plan.key) return { kind: "current" };

  const change = planChangeFor(plan.depositUsdCents, ledger);
  if (change.kind === "not_an_upgrade") return { kind: "lower" };
  if (change.kind === "top_up") return { kind: "upgrade", amountCents: change.amountCents };
  return { kind: "select", amountCents: change.amountCents };
}
