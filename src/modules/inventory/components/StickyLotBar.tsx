"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "@phosphor-icons/react/dist/ssr";

/**
 * The price and the one action, pinned to the bottom of a phone screen.
 *
 * ⚠️ WHY IT EXISTS. On a phone the lot page is a very long scroll — photos,
 * condition, vehicle, sale, then the cost panel — and "bid for me" sits at the
 * foot of the cost panel, which is most of a metre of scrolling below the fold.
 * The buyer spends that whole scroll unable to act on what they are reading,
 * and the current bid, which is the number they are deciding against, leaves the
 * screen within the first swipe. Every phone-first buying site solves this the
 * same way, and so does Copart's own app.
 *
 * IT SCROLLS TO THE REAL BUTTON RATHER THAN BEING A SECOND ONE. That is the
 * whole design decision here. "Bid for me" opens a dialog whose contents depend
 * on who is reading — plan, deposit already held, how close the sale is — and a
 * duplicate would either be a second copy of that state or a lie about it.
 * Worse, only a client with an active plan gets that button at all; everyone
 * else gets WhatsApp in the same slot. Sending the visitor TO whichever control
 * their situation actually earned them is correct for all of them, and there is
 * exactly one dialog on the page.
 *
 * IT HIDES ITSELF ONCE THE TARGET IS ON SCREEN. A pinned bar offering to scroll
 * somewhere the reader is already looking is noise, and it would sit on top of
 * the very button it points at — so an IntersectionObserver on the target
 * retires it. That is also why it fades rather than snapping: the transition
 * happens exactly when the reader arrives, and a hard cut there reads as a
 * glitch.
 *
 * Not rendered at all for a sale that has already run — see the lot page. There
 * is nothing to pin when there is nothing to do.
 */
export default function StickyLotBar({
  priceLabel,
  priceValue,
  secondaryLabel,
  secondaryValue,
  ctaLabel,
  targetId,
}: {
  priceLabel: string;
  priceValue: string;
  /** "Buy now", when the lot carries one. Dropped on the narrowest screens. */
  secondaryLabel?: string;
  secondaryValue?: string;
  ctaLabel: string;
  /** The id of the block holding the real button. */
  targetId: string;
}) {
  const [hidden, setHidden] = useState(false);
  /**
   * Nothing is pinned until the reader has actually started reading.
   *
   * Without this the bar is on screen while the header still is — covering the
   * photograph on first paint for no gain, since the price is already in the
   * header and the buttons are one swipe away at that point.
   *
   * ⚠️ A SCROLL POSITION, NOT A SENTINEL ELEMENT, and the first attempt got this
   * wrong in a way worth recording. It rendered a `<div>` of its own and armed
   * the bar once that div left the screen — which reads fine until you notice
   * the div is wherever THIS COMPONENT is mounted, and the lot page mounts it
   * at the very bottom. The behaviour was therefore correct by accident and
   * would have inverted the moment somebody moved the tag. A component whose
   * behaviour depends on where its own markup happens to sit is a trap for
   * whoever moves it next.
   */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) =>
        setHidden(
          // On screen: the buyer can see the button, so the bar has done its job
          // and would only sit on top of it.
          entry.isIntersecting ||
            // ⚠️ ALREADY SCROLLED PAST, WHICH IS NOT THE SAME AS "NOT YET
            // REACHED" and needs the same answer. Below the cost panel come
            // similar lots and the footer, and a bar that reappeared there would
            // cover the last 73px of the page for the whole rest of the scroll —
            // including the footer's own links. `isIntersecting` alone cannot
            // tell the two apart: it is false above the panel and below it.
            entry.boundingClientRect.top < 0
        ),
      // A sliver counts: by the time the panel's top edge is up, the buyer can
      // see the button.
      { rootMargin: "0px 0px -25% 0px" }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [targetId]);

  useEffect(() => {
    // Just over half a screen: past the photograph, into the specs.
    const threshold = () => window.innerHeight * 0.6;
    const check = () => setArmed(window.scrollY > threshold());
    check();
    // `passive` so the handler can never delay a scroll, and the work is one
    // comparison — cheap enough not to need throttling.
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  function goToTarget() {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-char-200 bg-white/95 backdrop-blur transition-all duration-200 lg:hidden ${
        armed && !hidden
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
      // The home indicator on an iPhone overlaps the bottom 34px, which would
      // eat the bottom of the button. `env()` is 0 everywhere it does not.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-char-500">
            {priceLabel}
          </p>
          <p className="truncate text-lg font-extrabold tabular-nums text-char-900">
            {priceValue}
          </p>
        </div>

        {/* Buy now second, and first to go: below 400px two numbers and a
            button do not fit, and the current bid is the one being decided
            against. An arbitrary `min-[400px]` rather than a named breakpoint —
            this project defines no `xs`, and inventing one for a single element
            would put a second scale in the design system. */}
        {secondaryValue && (
          <div className="hidden min-w-0 min-[400px]:block">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-char-500">
              {secondaryLabel}
            </p>
            <p className="truncate text-sm font-bold tabular-nums text-amber-700">
              {secondaryValue}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={goToTarget}
          // 48px tall: a thumb target at the very bottom edge of a phone,
          // which is the hardest place on the screen to hit accurately.
          className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-700 active:bg-amber-800"
        >
          {ctaLabel}
          <ArrowDown size={15} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}
