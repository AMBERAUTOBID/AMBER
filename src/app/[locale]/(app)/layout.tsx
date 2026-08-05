/**
 * The signed-in half of the site.
 *
 * The group exists to hold one property that must be true of every page
 * inside it and false of nothing else: **it renders per user, so it can never
 * be statically cached.** Declaring that here rather than page by page means
 * a page added to this group later cannot accidentally be pre-rendered and
 * served to the wrong person. The marketing pages outside the group keep
 * their static generation untouched — which is the whole reason for splitting
 * them (ARCHITECTURE.md §6a).
 *
 * It deliberately adds no markup. The account area's chrome belongs to
 * `account/layout.tsx`, so a future non-account app page doesn't inherit an
 * account sidebar.
 */
export const dynamic = "force-dynamic";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
