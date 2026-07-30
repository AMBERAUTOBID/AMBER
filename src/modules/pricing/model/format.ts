/**
 * Money formatting for cost estimates.
 *
 * Previously copy-pasted into both calculators, the vehicle detail page and
 * the Telegram bot's caption builder — four identical definitions, which is
 * four chances for one surface to start rounding differently from the others
 * while quoting the same underlying number.
 *
 * Runtime-agnostic on purpose: the bot imports this from outside Next.
 */

/**
 * Grouping is pinned to en-US rather than left to `toLocaleString()`'s default.
 * The default follows the *runtime's* locale, so the same estimate could render
 * "1,250" locally and "1.250" on a server configured differently — and these
 * figures go out in Telegram captions where nobody would catch it. The vehicle
 * detail page already pinned en-US for this reason; now everything does.
 */
const GROUPING_LOCALE = "en-US";

/** Estimates are rounded to whole units everywhere. Showing cents on a figure
 * that is explicitly an estimate implies a precision the model doesn't have. */
export function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString(GROUPING_LOCALE)}`;
}

export function formatEur(value: number): string {
  return `€${Math.round(value).toLocaleString(GROUPING_LOCALE)}`;
}
