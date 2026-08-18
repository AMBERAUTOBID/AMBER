import Container from "@/shared/ui/Container";

/**
 * Shown while the lot itself is being fetched.
 *
 * ⚠️ THE SITE HAD NO `loading.tsx` ANYWHERE, and on this route that was the
 * difference between "slow" and "broken". A Next navigation holds the OLD page
 * on screen until the new one is ready, so clicking a search result did
 * nothing at all — no spinner, no dimming, no change — for as long as the
 * server took. Visitors clicked twice, then left.
 *
 * The wait itself was addressed separately, by getting the slow related-lots
 * call off the critical path (see relatedFor in page.tsx). This is the other
 * half of the same problem: even a one-second wait needs to look like one.
 *
 * The shape deliberately mirrors the real page — a header band, then gallery
 * left and panel right — so the layout does not jump when the content lands.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <section className="border-b border-char-100 bg-gradient-to-b from-amber-50/50 to-background py-8 sm:py-10">
        <Container>
          <div className="flex gap-2">
            <div className="h-6 w-20 rounded-full bg-char-200/70" />
            <div className="h-6 w-28 rounded-full bg-char-100" />
          </div>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 lg:flex-1">
              <div className="h-8 w-3/4 max-w-lg rounded-lg bg-char-200/70" />
              <div className="mt-3 h-4 w-2/3 max-w-md rounded-full bg-char-100" />
            </div>
            <div className="w-full shrink-0 space-y-3 lg:w-[19rem]">
              <div className="h-24 rounded-2xl border border-char-200/70 bg-white" />
              <div className="h-12 rounded-full bg-char-200/60" />
            </div>
          </div>
        </Container>
      </section>

      <section className="py-8 sm:py-12">
        <Container>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-3">
              <div className="aspect-[4/3] w-full rounded-2xl bg-char-100" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="h-64 rounded-2xl border border-char-200/70 bg-white" />
                <div className="h-64 rounded-2xl border border-char-200/70 bg-white" />
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="h-96 rounded-2xl border border-char-200/70 bg-white" />
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
