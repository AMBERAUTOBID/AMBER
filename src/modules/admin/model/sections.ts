/**
 * The admin console's sidebar — the one list, so the nav and the pages can't
 * drift apart. Mirrors `modules/account/model/sections.ts` deliberately.
 *
 * ⚠️ Same rule as the client area: a section goes in here only once it has
 * real data behind it. An entry that opens onto "nothing yet" is worse than no
 * entry, and in a staff tool it is worse still — it teaches the operator that
 * some links don't work, which is exactly the habit you don't want when one of
 * the links refunds money.
 *
 * Nothing is absent from this list any more. `/admin/bids` was the last
 * placeholder entry and landed 2026-08-17.
 */
export interface AdminSectionLink {
  /** Message key under `Admin.nav`. */
  key: string;
  href: string;
}

export const ADMIN_SECTIONS: AdminSectionLink[] = [
  { key: "overview", href: "/admin" },
  // Second, not last: once cars are moving this is the screen an operator
  // opens all day, and the deposit queue is the one they visit occasionally.
  { key: "orders", href: "/admin/orders" },
  // Beside it, because they are the same files read with two different
  // questions — "where is this car?" and "who owes us money?" — and the answer
  // to the second decides whether the first is allowed to move.
  { key: "money", href: "/admin/money" },
  // Above deposits, because this one has an auction clock on it: a bid
  // instruction unanswered by tonight is worth nothing tomorrow, while a
  // deposit waiting to be confirmed is merely waiting.
  { key: "bids", href: "/admin/bids" },
  { key: "deposits", href: "/admin/deposits" },
  { key: "users", href: "/admin/users" },
  { key: "settings", href: "/admin/settings" },
];
