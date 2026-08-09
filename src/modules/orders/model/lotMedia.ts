import type { OrderFileKind } from "./fileRules";

/**
 * Which of a lot's media can be archived into a case file, and at what quality.
 *
 * Every rule here is a MEASUREMENT, taken 2026-08-09 against live lots on both
 * platforms (`scripts/r2/measure-photo-quality.ts`, `measure-lot-video.ts`).
 * Two of them are the opposite of the obvious guess, and both would have been
 * silent, permanent losses: the copy happens once, the auction drops the lot,
 * and nothing can be re-fetched afterwards.
 *
 * Pure. No network, no SDK — the fetching lives in the import worker.
 */

/** The media shape Apibara returns on a detail response. */
export interface LotMediaItem {
  type?: string;
  thumb?: string;
  large?: string;
  full?: string;
  url?: string;
}

export interface ArchivableMedia {
  kind: OrderFileKind;
  /** The URL to fetch, already upgraded to the best available quality. */
  url: string;
  /** Position in the auction's own gallery, so the order is preserved. */
  position: number;
  contentType: string;
}

/**
 * IAAI serves a resizer, not a file, and the API hands over `width=845`.
 *
 * **MEASURED:** the same image at other widths — 845 → 102 KB, 1920 → 448 KB,
 * 2400 → 635 KB, 3200 → 669 KB, 4096 → 682 KB, 6000 → 669 KB. It plateaus at
 * roughly 3200, which is where the underlying original ends; past that the
 * resizer is re-encoding rather than revealing anything.
 *
 * So archiving at the default width would have kept about **15%** of the
 * available detail, forever, on the one copy that can never be retaken. 3200
 * is the measured knee of that curve — not a round number chosen for comfort.
 */
const IAAI_ARCHIVE_WIDTH = 3200;

/**
 * The best URL for one gallery image.
 *
 * ⚠️ **Copart's `_hrs.jpg` is LARGER than `_ful.jpg`** — measured at 253 KB vs
 * 156 KB on one lot and 188 KB vs 119 KB on another. "ful" does not mean full.
 * Rewriting the suffix to something that reads like the full-size version
 * would have quietly halved the quality of every Copart photo we keep, so this
 * function deliberately does NOT touch Copart URLs at all.
 */
export function bestImageUrl(item: LotMediaItem): string | undefined {
  const url = item.full ?? item.large ?? item.url ?? item.thumb;
  if (!url) return undefined;
  return upgradeIaaiWidth(url);
}

/**
 * Raise an IAAI resizer URL to the archive width, keeping the aspect ratio the
 * auction chose. Any URL without both parameters is returned untouched — which
 * is every Copart URL, and any IAAI URL whose shape changes later.
 */
export function upgradeIaaiWidth(url: string, width = IAAI_ARCHIVE_WIDTH): string {
  const widthMatch = url.match(/[?&]width=(\d+)/);
  const heightMatch = url.match(/[?&]height=(\d+)/);
  if (!widthMatch || !heightMatch) return url;

  const currentWidth = Number(widthMatch[1]);
  const currentHeight = Number(heightMatch[1]);
  if (!currentWidth || !currentHeight) return url;

  // Never downscale: if the auction already offered something bigger than our
  // archive width, keeping it costs a few hundred kilobytes and losing it is
  // irreversible.
  if (currentWidth >= width) return url;

  const height = Math.round((width * currentHeight) / currentWidth);
  return url.replace(/([?&]width=)\d+/, `$1${width}`).replace(/([?&]height=)\d+/, `$1${height}`);
}

/**
 * Everything on a lot that can actually be stored as a file.
 *
 * Three types appear in `media.items[]` and they are not interchangeable:
 *
 * - **`image`** — archived. 12–22 per lot in every sample.
 * - **`video`** — archived. **MEASURED to be a genuine MP4**: Copart serves
 *   `..._O.mp4` at 6.7 MB and IAAI's `EngineVideoRetriever` returns 13–16 MB,
 *   both `video/mp4` with an `ftyp` container and Range support. On IAAI this
 *   is the engine-start clip — the evidence that the car ran on the day, which
 *   disappears with the listing and is among the most valuable things a buyer
 *   can be left holding.
 * - **`vr360`** — SKIPPED, and not because of an assumption. Fetching one
 *   returns **`text/html`, 26 KB, an HTML page**: it is a viewer, not a file.
 *   Recording its URL instead would place a link in a case file meant to
 *   outlive the listing by years, and it would rot silently.
 *
 * An unrecognised type is skipped rather than guessed at, for the same reason
 * the normalisers elsewhere return null instead of a default bucket.
 */
export function archivableMedia(items: LotMediaItem[] | undefined): ArchivableMedia[] {
  if (!items?.length) return [];

  const out: ArchivableMedia[] = [];
  let imagePosition = 0;
  let videoPosition = 0;

  for (const item of items) {
    if (item.type === "image") {
      const url = bestImageUrl(item);
      if (!url) continue;
      out.push({
        kind: "photo",
        url,
        position: imagePosition++,
        // The auctions serve JPEG for every sampled image. The import worker
        // still trusts the response header over this when one arrives.
        contentType: "image/jpeg",
      });
      continue;
    }

    if (item.type === "video") {
      const url = item.url ?? item.full ?? item.large;
      if (!url) continue;
      out.push({ kind: "video", url, position: videoPosition++, contentType: "video/mp4" });
      continue;
    }

    // vr360 and anything new: not a file.
  }

  return out;
}

/**
 * What the import is going to cost, so the admin sees a number before it runs
 * rather than a spinner of unknown length.
 *
 * Deliberately labelled an estimate. The per-item figures are the measured
 * medians — ~670 KB for an upgraded IAAI photo, ~250 KB for Copart, ~12 MB for
 * a video — and the real total is only known once each response arrives.
 */
export function estimateArchiveBytes(media: ArchivableMedia[]): number {
  let total = 0;
  for (const m of media) {
    if (m.kind === "video") total += 12 * 1024 * 1024;
    else total += m.url.includes("resizer") ? 670 * 1024 : 250 * 1024;
  }
  return total;
}
