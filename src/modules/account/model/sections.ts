/**
 * The account sidebar's contents — the one list, so the nav and the pages
 * can't drift apart.
 *
 * ⚠️ A section goes in here only once it has real data behind it
 * (ARCHITECTURE.md §6a). An entry that opens onto "nothing yet" advertises a
 * product that doesn't exist, and is worse than no entry at all. Still
 * deliberately absent until its feature lands:
 *
 *   /account/orders  Phase 2.4
 *
 * Two entries bend the rule, differently:
 *
 * - Favourites ships with an empty first state but the feature works from the
 *   first visit — the empty panel explains how to fill it.
 * - Bids is a PLACEHOLDER, added ahead of 2.3 at the owner's explicit request
 *   (2026-08-06). Its empty states stay honest by describing the real flow
 *   today — active plan, then the car sent by email or WhatsApp. When 2.3 lands it becomes the real thing.
 */
export interface AccountSection {
  /** Message key under `Account.nav`. */
  key: string;
  href: string;
}

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "overview", href: "/account" },
  { key: "bids", href: "/account/bids" },
  { key: "favorites", href: "/account/favorites" },
  { key: "plan", href: "/account/plan" },
  { key: "details", href: "/account/details" },
];
