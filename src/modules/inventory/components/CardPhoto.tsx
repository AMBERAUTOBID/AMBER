"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A card photograph that degrades to the card's own "no photo" state instead
 * of the browser's broken-image glyph.
 *
 * Dead images are real, not hypothetical: the proxy measurements of 2026-08-20
 * found catalogue rows whose CDN file is simply gone (upstream 404), and a
 * torn-corner icon on a result card reads as OUR site being broken rather
 * than the auction having removed a file.
 *
 * The `useEffect` check exists because `onError` alone is not enough: an image
 * that failed BEFORE hydration already fired its error event with nobody
 * listening. A finished-and-failed load reads from the DOM as `complete` with
 * `naturalWidth === 0`, so mount catches the early deaths and `onError` the
 * late ones.
 */
export default function CardPhoto({
  src,
  alt,
  noPhotoLabel,
}: {
  src: string;
  alt: string;
  /** The same wording the photo-less card shows — one state, not two. */
  noPhotoLabel: string;
}) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, []);

  if (broken) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-char-500">
        {noPhotoLabel}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      /**
       * ⚠️ TWENTY OF THESE LOAD AT ONCE ON A SEARCH PAGE, and about six
       * are on screen. Measured 2026-08-20: none of them were lazy, so a
       * phone fetched every photograph in the grid before the visitor had
       * scrolled to any of them.
       *
       * `decoding="async"` for the same reason from the other end: the
       * main thread should not block decoding a JPEG for a card that is
       * still below the fold.
       *
       * ⚠️ NOT `priority`/eager on the first row, deliberately. These
       * cards are also the home page's rail, where the row starts off
       * screen — a rule that helps search would hurt there, and the
       * component cannot tell which page it is on.
       */
      loading="lazy"
      decoding="async"
      // The intrinsic size of the card variant we now request — see
      // photoSize.ts. Given so the browser can reserve the box before the
      // bytes arrive; the 4:3 wrapper already fixes the layout, so this is
      // belt and braces rather than the fix for a jump.
      width={960}
      height={720}
      onError={() => setBroken(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}
