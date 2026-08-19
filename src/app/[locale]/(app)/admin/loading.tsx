import Container from "@/shared/ui/Container";

/**
 * Shown while any admin section loads.
 *
 * ONE FILE FOR EIGHT PAGES — orders, bids, users, money, deposits, settings and
 * the two detail views all hang off `AdminShell`, which is the same sidebar-plus-
 * column the account area uses. A page added later inherits this rather than
 * quietly shipping without a loading state.
 *
 * ROWS, NOT CARDS, and that is the one way this differs from the account
 * skeleton beside it. Every admin list is a table — the order queue, the bid
 * queue, the user list — and a skeleton made of cards would reflow into rows the
 * moment the data lands, which is the jump a skeleton exists to prevent.
 *
 * ⚠️ WHY IT MATTERS MORE HERE THAN ANYWHERE. These pages carry the widest
 * queries on the site and they are the ones opened under time pressure: an
 * auction deadline, a client asking where their money went. A Next navigation
 * leaves the previous page on screen until the new one is ready, so without this
 * the queue simply does not appear to respond — and the honest reading of a
 * button that does nothing is that it is broken.
 *
 * ⚠️ NOT MEASURED UNDER A REAL SESSION. Signed out these answer 404 in ~70 ms,
 * so a stopwatch says nothing about the case this exists for. What is claimed
 * here is that the skeleton matches `AdminShell`'s layout, not any duration.
 */
export default function Loading() {
  return (
    <Container className="animate-pulse py-12 md:py-16">
      <div className="md:flex md:gap-12">
        <aside className="hidden md:block md:w-56 md:shrink-0">
          <div className="h-6 w-28 rounded-lg bg-char-200/70" />
          <div className="mt-2 h-3 w-40 rounded-full bg-char-100" />
          <div className="mt-6 space-y-2.5 border-t border-char-200/70 pt-4">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-4 w-full rounded-full bg-char-100" />
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="h-8 w-64 max-w-full rounded-lg bg-char-200/70" />
          {/* The filter row every admin list carries above its table. */}
          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-9 w-40 rounded-xl bg-char-100" />
            <div className="h-9 w-28 rounded-full bg-char-100" />
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-char-200/70 bg-white">
            <div className="border-b border-char-200/70 px-5 py-3">
              <div className="h-3 w-1/3 rounded-full bg-char-100" />
            </div>
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-char-100 px-5 py-4 last:border-b-0"
              >
                <div className="h-4 flex-1 rounded-full bg-char-100" />
                <div className="hidden h-4 w-24 rounded-full bg-char-100 sm:block" />
                <div className="h-4 w-16 rounded-full bg-char-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
