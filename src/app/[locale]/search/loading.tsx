import Container from "@/shared/ui/Container";

/**
 * Shown while a search runs.
 *
 * ⚠️ SEARCH IS THE MOST-CLICKED AND ONE OF THE SLOWEST PAGES, AND IT HAD NO
 * LOADING STATE. A Next navigation keeps the OLD page on screen until the new
 * one is ready, so choosing a filter did nothing visible — no dimming, no
 * spinner, nothing — for as long as the query took. People click twice, then
 * leave. The vehicle page had exactly this fault and it was fixed on
 * 2026-08-17; this is the same fix on the page it matters most.
 *
 * The shape mirrors the real results grid — filter rail on the left, cards on
 * the right — so the layout does not jump when the rows land.
 */
export default function Loading() {
  return (
    <Container className="animate-pulse py-8 sm:py-10">
      <div className="h-4 w-48 rounded-full bg-char-100" />
      <div className="mt-3 h-8 w-72 max-w-full rounded-lg bg-char-200/70" />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[17rem_1fr]">
        {/* Filter rail — hidden on a phone, exactly as the real page hides it */}
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-char-200/70 bg-white p-4">
              <div className="h-3 w-24 rounded-full bg-char-100" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded-full bg-char-100" />
                <div className="h-3 w-4/5 rounded-full bg-char-100" />
                <div className="h-3 w-3/5 rounded-full bg-char-100" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-char-200 bg-white">
              <div className="aspect-[4/3] w-full bg-char-100" />
              <div className="space-y-2.5 p-4">
                <div className="h-4 w-3/4 rounded-full bg-char-100" />
                <div className="h-5 w-1/2 rounded-full bg-char-100" />
                <div className="h-3 w-2/3 rounded-full bg-char-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
