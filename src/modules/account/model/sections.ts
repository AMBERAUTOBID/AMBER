/**
 * The account sidebar's contents — the one list, so the nav and the pages
 * can't drift apart.
 *
 * ⚠️ A section goes in here only once it has real data behind it
 * (ARCHITECTURE.md §6a). An entry that opens onto "nothing yet" advertises a
 * product that doesn't exist, and is worse than no entry at all. The next
 * three are known and deliberately absent until their features land:
 *
 *   /account/bids       Phase 2.3
 *   /account/watchlist  Phase 2.4
 *   /account/orders     Phase 2.4
 */
export interface AccountSection {
  /** Message key under `Account.nav`. */
  key: string;
  href: string;
}

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "overview", href: "/account" },
  { key: "plan", href: "/account/plan" },
  { key: "details", href: "/account/details" },
];
