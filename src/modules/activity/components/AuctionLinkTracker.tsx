"use client";

import { useEffect } from "react";
import { reportActivity } from "./reportActivity";

/**
 * Notes when a client leaves for Copart's or IAAI's own listing.
 *
 * A signal worth having: someone who opens the source listing is checking our
 * page against the auction's, which people do when they are close to bidding
 * rather than while browsing.
 *
 * **A listener rather than a wrapper component.** The link is a badge inside a
 * server-rendered header, and turning it into a client component would drag
 * that markup — and the translations around it — across the boundary for one
 * `onClick`. This attaches to the existing anchor by id instead, which leaves
 * the page exactly as it was and degrades to nothing at all if the anchor is
 * not rendered (`auctionLotUrl` refuses to guess a URL, so sometimes it is
 * not).
 */
export default function AuctionLinkTracker({
  anchorId,
  platform,
  lotNumber,
}: {
  anchorId: string;
  platform: string;
  lotNumber: string;
}) {
  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const onClick = () =>
      reportActivity("lot.external_opened", { platform, lot: lotNumber });
    // Capture phase, so a click that navigates away still fires this first.
    // `reportActivity` sends with `keepalive` for the same reason.
    anchor.addEventListener("click", onClick, { capture: true });
    return () => anchor.removeEventListener("click", onClick, { capture: true });
  }, [anchorId, platform, lotNumber]);

  return null;
}
