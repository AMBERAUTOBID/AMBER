/**
 * The account sidebar's contents — the one list, so the nav and the pages
 * can't drift apart.
 *
 * ⚠️ A section goes in here only once it has real data behind it
 * (ARCHITECTURE.md §6a). An entry that opens onto "nothing yet" advertises a
 * product that doesn't exist, and is worse than no entry at all. The rest are
 * known and deliberately absent until their features land:
 *
 *   /account/bids    Phase 2.3
 *   /account/orders  Phase 2.4
 *
 * Favourites is the exception that proves the rule: it ships with a genuinely
 * empty first state, but the feature behind it works from the first visit —
 * the empty panel explains how to fill it and links to the search. That is
 * different from a tab describing a product we cannot yet deliver.
 */
export interface AccountSection {
  /** Message key under `Account.nav`. */
  key: string;
  href: string;
}

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "overview", href: "/account" },
  { key: "favorites", href: "/account/favorites" },
  { key: "plan", href: "/account/plan" },
  { key: "details", href: "/account/details" },
];
