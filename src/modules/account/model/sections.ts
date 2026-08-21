/**
 * The account sidebar's contents — the one list, so the nav and the pages
 * can't drift apart.
 *
 * ⚠️ A section goes in here only once it has real data behind it
 * (ARCHITECTURE.md §6a). An entry that opens onto "nothing yet" advertises a
 * product that doesn't exist, and is worse than no entry at all.
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

/**
 * What an ADMIN sees of the account area: details only. Everything else on
 * this list is a customer feature guarded by `requireClient`, and a nav
 * entry that redirects on click is worse than no entry. One list filtered,
 * not two lists — so a new section cannot be added to one and forgotten in
 * the other.
 */
export function accountSectionsFor(role: "client" | "admin"): AccountSection[] {
  if (role === "admin") return ACCOUNT_SECTIONS.filter((s) => s.key === "details");
  return ACCOUNT_SECTIONS;
}

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "overview", href: "/account" },
  /**
   * The Phase 2.4 slot this file has been holding open, now filled. It sits
   * above bids deliberately: a car that has been bought is the thing a client
   * opens the account for, and a bid still in progress is the thing they check
   * on the way past.
   *
   * It ships with an empty state rather than being hidden until a client has
   * one, on the Favourites precedent — the feature works from the first visit,
   * and the empty panel explains what will appear.
   */
  { key: "orders", href: "/account/orders" },
  { key: "bids", href: "/account/bids" },
  { key: "favorites", href: "/account/favorites" },
  { key: "plan", href: "/account/plan" },
  /**
   * The shipping details a client fills once, before bidding — who buys,
   * where the car goes, who receives it, and how they will pay. Sits after
   * plan because that is its place in the client's own sequence: deposit
   * confirmed, then this, then the bidding code. The gate reads
   * `isShippingProfileComplete`, never its own copy of the rules.
   */
  { key: "shipping", href: "/account/shipping" },
  { key: "details", href: "/account/details" },
];
