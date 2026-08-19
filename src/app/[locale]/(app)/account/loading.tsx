import Container from "@/shared/ui/Container";

/**
 * Shown while any account section loads.
 *
 * ONE FILE FOR SIX PAGES, and that is the point of putting it here rather than
 * beside each of them. Dashboard, orders, favourites, bids, plan and details all
 * hang the same shell — a sidebar and one column — off `AccountShell`, so one
 * skeleton is honest for all of them, and a page added later inherits it instead
 * of quietly shipping without one.
 *
 * ⚠️ WHY THESE PAGES NEED IT AT ALL. A Next navigation keeps the OLD page on
 * screen until the new one is ready: click "Orders" from the dashboard and
 * nothing at all happens until the query returns. Every one of these pages runs
 * at least one database query behind a session lookup, and the account area is
 * where a client goes when they are already anxious about money they have sent.
 * The search page had exactly this fault and it was fixed on 2026-08-18.
 *
 * ⚠️ NOT MEASURED UNDER A REAL SESSION. Signed out, every one of these answers
 * 307 to /login in ~70 ms, so the numbers a curl can produce say nothing about
 * the case this exists for. The shape is taken from `AccountShell` rather than
 * from a stopwatch; what is claimed here is that the skeleton matches the
 * layout, not that it is on screen for any particular length of time.
 *
 * The sidebar mirrors the real one — hidden below `md`, 14rem wide above it —
 * so the content does not jump sideways when the page lands.
 */
export default function Loading() {
  return (
    <Container className="animate-pulse py-12 md:py-16">
      <div className="md:flex md:gap-12">
        <aside className="hidden md:block md:w-56 md:shrink-0">
          <div className="h-6 w-32 rounded-lg bg-char-200/70" />
          <div className="mt-2 h-3 w-40 rounded-full bg-char-100" />
          <div className="mt-6 space-y-2.5 border-t border-char-200/70 pt-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-4 w-full rounded-full bg-char-100" />
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="h-7 w-56 max-w-full rounded-lg bg-char-200/70" />
          <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-char-100" />
          {/* Three cards: enough to fill the fold on a laptop without
              promising a row count the real page may not have. */}
          <div className="mt-8 space-y-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-2xl border border-char-200/70 bg-white p-5">
                <div className="h-4 w-1/3 rounded-full bg-char-100" />
                <div className="mt-3 h-3 w-2/3 rounded-full bg-char-100" />
                <div className="mt-2 h-3 w-1/2 rounded-full bg-char-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
