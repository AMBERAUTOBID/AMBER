"use client";

import type { ClientRecordableKind } from "../model/clientEvents";

/**
 * Tell the server about something only the browser saw.
 *
 * **Fire and forget, and silent by design.** Nothing on the page depends on
 * the outcome: the client is costing a car or leaving for Copart, and an
 * error here must not interrupt either. Failures are swallowed rather than
 * logged, because a console full of red from an analytics call teaches people
 * to ignore the console.
 *
 * `keepalive` matters for `lot.external_opened` specifically — the click that
 * fires it also navigates away, and without it the browser is free to cancel
 * the request in flight, which would lose exactly the events most worth
 * having.
 *
 * The request carries only identifiers. The label a human reads is resolved
 * server-side from the client's own history, so nothing here can name a car.
 */
export function reportActivity(
  kind: ClientRecordableKind,
  payload: { platform: string; lot: string; port?: string }
): void {
  try {
    void fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing to do and nobody to tell.
  }
}
