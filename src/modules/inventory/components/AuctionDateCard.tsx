"use client";

import { useSyncExternalStore } from "react";
import { CalendarBlank, Clock } from "@phosphor-icons/react/dist/ssr";
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
  /** The server's verdict at render time. The clock can only move this to
   *  closed, never back — a sale time in the past does not return. */
  isUpcoming,
  labels,
}: {
  isoDate: string;
  formatted: string | null;
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

  // Before hydration `remaining` is null and only the server's verdict is
  // available, which is what keeps the first paint identical on both sides.
  const closed = !isUpcoming || (remaining !== null && remaining <= 0);

  return (
    <div
      className={
        closed
          ? "rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-right"
          : "rounded-xl border border-char-200 bg-white px-4 py-2.5 text-right"
      }
    >
      <p
        className={`flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wider ${
          closed ? "text-red-700/70" : "text-char-400"
        }`}
      >
        <CalendarBlank size={13} />
        {closed ? labels.saleDate : labels.endsIn}
      </p>

      <div className="mt-1">
        {closed ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700">
            <Clock size={15} weight="fill" className="text-red-600" />
            {labels.closed}
          </span>
        ) : remaining === null ? (
          // Height reserved so the card does not jump when the clock starts.
          <span className="inline-block h-5" aria-hidden />
        ) : (
          <Countdown remaining={remaining} labels={labels} />
        )}
      </div>

      {formatted && (
        <p className={`mt-0.5 text-xs ${closed ? "text-red-700/60" : "text-char-400"}`}>
          {formatted}
        </p>
      )}
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
  const total = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
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
