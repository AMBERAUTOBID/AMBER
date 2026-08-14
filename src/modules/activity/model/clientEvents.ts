import { PORT_MULTIPLIER } from "@/modules/pricing/model/costEstimate";
import type { ActivityKind } from "@/shared/db/schema";

/**
 * The only event kinds the browser is allowed to report.
 *
 * Both are things no server render can observe: a client changing the
 * destination port in the cost calculator, and a client leaving for Copart or
 * IAAI. Everything else is written server-side from data we fetched
 * ourselves.
 *
 * ⚠️ **`lot.viewed` must never appear here.** It is the baseline every other
 * signal is read against, and the endpoint copies its label as the one vetted
 * name for a lot. Let the browser write it and a client could fill their own
 * file with cars they never opened — and, worse, name them anything they
 * liked. The allowlist is small on purpose; adding to it is a decision about
 * trust, not a convenience.
 */
export const CLIENT_RECORDABLE = ["lot.cost_calculated", "lot.external_opened"] as const;

export type ClientRecordableKind = (typeof CLIENT_RECORDABLE)[number];

export function isClientRecordable(value: string): value is ClientRecordableKind {
  return (CLIENT_RECORDABLE as readonly string[]).includes(value);
}

/**
 * The destinations the calculator offers, taken from the pricing model rather
 * than restated.
 *
 * Restating them would let the two drift, and the drift would be silent: a
 * port added to the calculator would simply stop being recorded, and the
 * strongest signal on the site would go quietly missing for whichever
 * destination was newest.
 */
export const PORT_KEYS: string[] = Object.keys(PORT_MULTIPLIER);

/** Compile-time proof that the allowlist only names real kinds. */
const _kindsExist: readonly ActivityKind[] = CLIENT_RECORDABLE;
void _kindsExist;
