"use client";

import { useSyncExternalStore } from "react";
import { CalendarBlank, Clock } from "@phosphor-icons/react/dist/ssr";
import { formatInstant } from "@/shared/time/formatInstant";
import { splitDuration } from "@/shared/time/splitDuration";
import { auctionClockStore } from "./auctionClock";

/**
 * The sale-date card, red once the auction is over.
 *
 * WHY A CLIENT COMPONENT. A bid placed on a lot that has already sold is the
 * expensive mistake this page can cause, so "closed" has to be unmissable — the
 * whole card, not a grey line inside an otherwise unchanged one. Two different
 * things know it is over, and only one of them is the server:
 *
 *  - the server, when it renders a lot whose sale time has passed;
 *  - the browser, when the sale time passes while the page sits open. Detail
 *    comes from Apibara through a 10-minute cache, so a lot can arrive already
 *    stale and the server never learns.
 *
 * A CSS `:has()` on the server-rendered card was tried first and abandoned:
 * Tailwind did not emit the rule for `has-[[data-auction-closed]]`, and the
 * card stayed white while `element.matches()` insisted the selector matched.
 * Rather than fight the generator over a rule that decides whether someone
 * bids on a sold car, the card owns the clock.
 */
export default function AuctionDateCard({
  isoDate,
  formatted,
  locale,
  /** The server's verdict at render time. The clock can only move this to
   *  closed, never back — a sale time in the past does not return. */
  isUpcoming,
  labels,
}: {
  isoDate: string;
  /** The vendor's own rendering — a fallback, never the preferred answer.
   *  See the sale-time note below. */
  formatted: string | null;
  locale: string;
  isUpcoming: boolean;
  labels: {
    endsIn: string;
    saleDate: string;
    closed: string;
    dayShort: string;
    hourShort: string;
    minuteShort: string;
    secondShort: string;
  };
}) {
  const nowSeconds = useSyncExternalStore(
    auctionClockStore.subscribe,
    auctionClockStore.getSnapshot,
    auctionClockStore.getServerSnapshot
  );

  const target = new Date(isoDate).getTime();
  const hasClock = nowSeconds > 0 && Number.isFinite(target);
  const remaining = hasClock ? target - nowSeconds * 1000 : null;

  /**
   * THE SALE TIME, IN THE READER'S ZONE — not the vendor's.
   *
   * `formatted` arrives from the data vendor already rendered, in English and
   * in a zone of their choosing. Printing it under a countdown computed in the
   * reader's zone put two contradictory numbers on one card: measured
   * 2026-08-13, "5val 50min" above "Aug 14, 2026 04:00", seven hours apart for
   * a reader in Savannah.
   *
   * `nowSeconds > 0` is the same signal the countdown uses for "the clock is
   * running, so we are on the client". Before it the vendor's string shows, so
   * the first paint is identical on both sides and the card does not resize
   * when the real answer arrives.
   */
  const localWhen = nowSeconds > 0 ? formatInstant(isoDate, locale) : null;
  const when = localWhen ?? formatted;

  // Before hydration `remaining` is null and only the server's verdict is
  // available, which is what keeps the first paint identical on both sides.
  const closed = !isUpcoming || (remaining !== null && remaining <= 0);

  return (
    /*
     * ⚠️ A STRIP, NOT THE TALL RIGHT-HAND CARD IT USED TO BE.
     *
     * This sat at the top of a fixed-width column beside the title, above the
     * bid button and the save button. Those three stacked into a panel roughly
     * the height of a screen, and because the title block beside it is two
     * short lines, the header opened with a large empty rectangle and pushed
     * the car's photograph most of a screen down the page. The owner reported
     * exactly that on 2026-08-17, and the panel was the whole of it.
     *
     * Left-aligned rather than right-, because it is no longer the top of a
     * right-hand column — it is a chip that sits beside the heading.
     */
    <div
      className={
        closed
          ? "inline-flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5"
          : "inline-flex items-center gap-3 rounded-xl border border-char-200 bg-white px-4 py-2.5"
      }
    >
      <CalendarBlank
        size={17}
        weight="duotone"
        className={closed ? "shrink-0 text-red-600" : "shrink-0 text-amber-500"}
      />
      <div className="min-w-0">
        <p
          className={`text-[11px] font-semibold uppercase tracking-wider ${
            closed ? "text-red-700/70" : "text-char-500"
          }`}
        >
          {closed ? labels.saleDate : labels.endsIn}
        </p>

        {closed ? (
          <span className="flex items-center gap-1.5 text-sm font-bold text-red-700">
            <Clock size={15} weight="fill" className="text-red-600" />
            {labels.closed}
          </span>
        ) : remaining === null ? (
          // Height reserved so the strip does not jump when the clock starts.
          <span className="block h-5" aria-hidden />
        ) : (
          <Countdown remaining={remaining} labels={labels} />
        )}

        {when && (
          <p className={`text-xs ${closed ? "text-red-700/60" : "text-char-500"}`}>
            {/* The machine-readable instant stays in the markup whatever the
                rendered text says, so the page carries the one unambiguous form
                of this fact. */}
            <time dateTime={isoDate}>{when}</time>
          </p>
        )}
      </div>
    </div>
  );
}

function Countdown({
  remaining,
  labels,
}: {
  remaining: number;
  labels: { dayShort: string; hourShort: string; minuteShort: string; secondShort: string };
}) {
  // Shared with the result cards' countdown so the same sale cannot be shown
  // as "2d 4h" in a grid and "2d 5h" one click later.
  const { days, hours, minutes, seconds } = splitDuration(remaining);
  /** Under an hour is when a buyer has to decide now rather than later. */
  const urgent = remaining < 60 * 60 * 1000;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${
        urgent ? "text-red-600" : "text-char-900"
      }`}
    >
      <Clock size={15} weight="fill" className={urgent ? "text-red-500" : "text-amber-500"} />
      <span>
        {days > 0 && `${days}${labels.dayShort} `}
        {(days > 0 || hours > 0) && `${hours}${labels.hourShort} `}
        {minutes}
        {labels.minuteShort} {String(seconds).padStart(2, "0")}
        {labels.secondShort}
      </span>
    </span>
  );
}
