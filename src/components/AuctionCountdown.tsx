"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Clock } from "@phosphor-icons/react/dist/ssr";

/**
 * Apibara ships a pre-computed `countdown` object, but our Apibara responses
 * are cached for 10 minutes (see REVALIDATE_SECONDS), so that number can be
 * up to 10 minutes stale on arrival - unacceptable for a field whose whole
 * job is to say how long is left. This recomputes from the sale's absolute
 * ISO instant instead, which stays correct no matter how long the response
 * sat in the cache.
 *
 * The clock lives in a module-level external store rather than component
 * state: reading Date.now() during render is impure, and setting state from
 * an effect on every tick cascades renders. useSyncExternalStore is the
 * supported way to subscribe to a changing outside value, and its separate
 * server snapshot is what keeps the first paint identical on both sides
 * (server and client clocks never agree to the second).
 */
let currentSecond = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    currentSecond = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      currentSecond = Math.floor(Date.now() / 1000);
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentSecond;
/** 0 means "clock not running yet" - both on the server and before mount. */
const getServerSnapshot = () => 0;

function split(msRemaining: number) {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export default function AuctionCountdown({
  isoDate,
  className,
}: {
  isoDate: string;
  className?: string;
}) {
  const t = useTranslations("VehicleDetail.auction");
  const nowSeconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target) || nowSeconds === 0) {
    return <span className={clsx("inline-block h-5", className)} aria-hidden />;
  }

  const remaining = target - nowSeconds * 1000;
  if (remaining <= 0) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 text-sm font-semibold text-char-500",
          className
        )}
      >
        <Clock size={15} weight="fill" />
        {t("closed")}
      </span>
    );
  }

  const { days, hours, minutes, seconds } = split(remaining);
  const urgent = remaining < 60 * 60 * 1000;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums",
        urgent ? "text-red-600" : "text-char-900",
        className
      )}
    >
      <Clock size={15} weight="fill" className={urgent ? "text-red-500" : "text-amber-500"} />
      <span>
        {days > 0 && `${days}${t("dayShort")} `}
        {(days > 0 || hours > 0) && `${hours}${t("hourShort")} `}
        {minutes}
        {t("minuteShort")} {String(seconds).padStart(2, "0")}
        {t("secondShort")}
      </span>
    </span>
  );
}
