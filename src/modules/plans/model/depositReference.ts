/**
 * The string a client puts in the reference field when they send a deposit.
 *
 * ── WHY A DEPOSIT NEEDS ONE AT ALL ──────────────────────────────────────
 * Money arriving with nothing to identify it is the failure that costs an
 * afternoon — the same reason `reference.ts` exists for orders. A deposit is
 * worse than an order in one respect: several clients pay the *same round
 * figure* on the same tier, so an unlabelled $1,500 could belong to any of
 * them, and the sender's name on a transfer is whatever their bank felt like
 * sending.
 *
 * ── WHY NOT THE THINGS THAT WERE ALREADY THERE ──────────────────────────
 * - **The row's uuid**: 36 characters, and nobody types that into a bank form
 *   without a mistake. Banks also truncate long references.
 * - **The client's email**: it identifies the person but not *which request* —
 *   an upgrade creates a second deposit row while the first is still open, and
 *   the two are different amounts. Banks also mangle `@` and dots.
 *
 * ── WHY THIS SHAPE ──────────────────────────────────────────────────────
 * Eight hex characters of the row's own id, which is a v4 uuid and therefore
 * random there. Short enough to copy by eye, unique enough that two open
 * deposits will not collide, and **derived rather than stored** — so it needs
 * no column, no migration, and cannot drift out of step with the row it names.
 *
 * `DEP-` in front because a reference with no prefix looks like a typo, and
 * because it distinguishes a deposit from the `SAB-2026-0001` an order uses,
 * on a bank statement where both will appear.
 */
export function depositReference(depositId: string): string {
  const hex = depositId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `DEP-${hex}`;
}
