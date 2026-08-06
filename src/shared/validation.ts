/**
 * Request-input shape checks shared across API routes.
 *
 * UUID first appeared in one route, then got copy-pasted into three more —
 * consolidated in the 2026-08-06 audit. The check matters everywhere ids
 * arrive from a browser: Postgres RAISES on a malformed uuid literal rather
 * than matching nothing, so an unchecked junk id surfaces as a 500 (and an
 * error-log entry) instead of the 400 it deserves.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
