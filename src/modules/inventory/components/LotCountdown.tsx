"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "@phosphor-icons/react/dist/ssr";
import { splitDuration } from "@/shared/time/splitDuration";
import { auctionClockStore } from "./auctionClock";

/**
 * Time left, on a result card.
 *
 * Shares `auctionClockStore` with the vehicle page rather than holding its own
 * interval: a grid of twenty-four cards would otherwise start twenty-four
 * timers a fraction of a second apart, and two cards counting the same sale
 * would visibly disagree. One store, one tick, every card in step.
 *
 * Renders nothing until the clock is running, which is also the signal that we
 * are on the client — so the server and the first client paint agree, and the
 * grid does not reflow when the numbers arrive.
 *
 * Seconds appear only inside the last hour. Above that they are noise on a card
 * somebody is scrolling past; below it they are the reason to stop scrolling.
 */
export default function LotCountdown({
  iso,
  labels,
}: {
  iso: string;
  labels: { dayShort: string; hourShort: string; minuteShort: string; secondShort: string };
}) {
  const nowSeconds = useSyncExternalStore(
    auctionClockStore.subscribe,
    auctionClockStore.getSnapshot,
    auctionClockStore.getServerSnapshot
  );

  if (nowSeconds === 0) return null;

  const remaining = Date.parse(iso) - nowSeconds * 1000;
  // The sale ran while the page sat open. The card cannot re-fetch itself, so
  // it stops claiming a future rather than showing zeroes.
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const { days, hours, minutes, seconds } = splitDuration(remaining);
  const urgent = remaining < 3_600_000;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${
        urgent ? "text-red-600" : "text-char-600"
      }`}
    >
      <Clock size={13} weight="fill" className={urgent ? "text-red-500" : "text-amber-500"} />
      {days > 0 && `${days}${labels.dayShort} `}
      {(days > 0 || hours > 0) && `${hours}${labels.hourShort} `}
      {minutes}
      {labels.minuteShort}
      {urgent && ` ${String(seconds).padStart(2, "0")}${labels.secondShort}`}
    </span>
  );
}
