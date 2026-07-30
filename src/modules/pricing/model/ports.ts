/**
 * Display names for destination ports.
 *
 * Port names are *lookup keys* — they index PORT_MULTIPLIER and PORT_CUSTOMS
 * in costEstimate.ts, and they travel to the Telegram bot. They therefore
 * cannot be translated in messages/*.json like ordinary copy; the key has to
 * stay stable while the label varies. This module is that override layer.
 */

/** Keyed by port, then by locale. Anything absent falls back to the key. */
export const PORT_DISPLAY_NAMES: Record<string, Partial<Record<string, string>>> = {
  "Klaipėda, Lithuania": { lt: "Klaipėdos, Lithuania" },
};

/**
 * The full localised label — e.g. the Lithuanian genitive "Klaipėdos", which
 * is correct after the preposition the site calculator puts in front of it
 * ("shipping to Klaipėdos").
 */
export function portLabel(port: string, locale: string): string {
  return PORT_DISPLAY_NAMES[port]?.[locale] ?? port;
}

/**
 * Just the city, in the nominative, deliberately ignoring the localised
 * override above.
 *
 * These two functions look like they should be one. They must not be. The
 * per-lot panel interpolates the city as a bare label with no preposition in
 * front of it, where the genitive "Klaipėdos" is simply wrong — it needs the
 * nominative "Klaipėda". Collapsing this into `portLabel(...).split(",")[0]`
 * produces grammatically broken Lithuanian.
 */
export function portCityNominative(port: string): string {
  return port.split(",")[0];
}
