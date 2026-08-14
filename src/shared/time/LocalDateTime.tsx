"use client";

import { useSyncExternalStore } from "react";
import { formatInstant } from "./formatInstant";

/** Never fires; the store exists only to give useSyncExternalStore a shape. */
const noSubscribe = () => () => {};

/**
 * An instant, rendered for whoever is reading it.
 *
 * A timezone-dependent string cannot be produced on the server: it would either
 * guess the reader's zone or be baked into a cached page and be wrong for
 * everyone else. So the server renders `fallback` — whatever the page already
 * had — and the real answer replaces it once we are on the client. Two
 * snapshots rather than an effect, so the first paint matches on both sides and
 * React never reports a hydration mismatch.
 *
 * `fallback` is deliberately required to be passed explicitly, including as
 * null: on this page the only candidate is the vendor's own pre-rendered
 * string, which is the very thing we are replacing, and that trade — a wrong
 * zone for a fraction of a second against a card that resizes on every load —
 * should be made at the call site rather than hidden in here.
 */
export default function LocalDateTime({
  iso,
  locale,
  fallback,
}: {
  iso: string;
  locale: string;
  fallback: string | null;
}) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );

  const text = (hydrated ? formatInstant(iso, locale) : null) ?? fallback;
  if (!text) return null;

  return <time dateTime={iso}>{text}</time>;
}
