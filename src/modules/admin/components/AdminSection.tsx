/**
 * One block of the admin console.
 *
 * The console is deliberately built as a list of sections rather than a page
 * with two hard-coded panels, because it is going to grow — a users view with
 * search, bid requests (2.3), orders (2.4) — and the cost of that growth
 * should be adding a section, not rewriting the page each time.
 *
 * When the list outgrows one scroll, this is the seam where a sidebar or tabs
 * go: the page already hands over titles and counts, so navigation can be
 * built from the same list without touching any section's contents. Until
 * then, stacked sections are the honest amount of structure for two of them.
 */
export default function AdminSection({
  title,
  count,
  children,
}: {
  title: string;
  /** Shown beside the heading. Omit where a count means nothing. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-char-500">
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-char-100 px-2 py-0.5 text-xs font-semibold text-char-700">
            {count}
          </span>
        )}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
