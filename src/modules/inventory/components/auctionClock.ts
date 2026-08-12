"use client";

/**
 * One ticking clock for the whole page.
 *
 * Extracted from `AuctionCountdown` so the date card can share it: two
 * subscribers to one interval rather than two intervals a second apart, which
 * is what produced a card and its countdown disagreeing by a second.
 *
 * A module-level external store rather than component state, for the reason
 * `useSyncExternalStore` exists: reading `Date.now()` during render is impure,
 * and setting state from an effect on every tick cascades renders. The separate
 * server snapshot is what keeps the first paint identical on both sides —
 * server and client clocks never agree to the second.
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

export const auctionClockStore = {
  subscribe,
  getSnapshot: () => currentSecond,
  /** 0 means "clock not running yet" — on the server, and before mount. */
  getServerSnapshot: () => 0,
};
