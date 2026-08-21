/**
 * One page of two ordered streams, interleaved — the default search order's
 * answer to a wall of one auction.
 *
 * WHY. The default order is soonest-sale-first, and US auctions run in blocks:
 * thousands of lots share one platform's next block, so page after page came
 * back pure IAAI until that block ran out (owner reported it 2026-08-21).
 * Inside a block the deadline cannot discriminate anyway — the segmented
 * search already documents that those pages were arbitrary — so alternating
 * the two platforms breaks the wall without making the order less honest:
 * each platform's own lots still appear soonest-first.
 *
 * THE MERGED ORDER IS DEFINED, not vibes, because pages must not repeat or
 * drop cars as a visitor walks them: positions alternate A,B,A,B while both
 * streams have items (position m takes stream m%2 at index m>>1), and once
 * the shorter stream ends at size `min`, every later position m takes the
 * longer stream at index m−min. Any window of that sequence is computable
 * from stream reads alone, which is what this function does:
 *
 *  1. Fetch both streams' optimistic ranges for the window in parallel —
 *     correct whenever neither stream ends inside the window, which is every
 *     page a visitor actually reaches.
 *  2. A short read reveals a stream's exact size for free; only a read of
 *     ZERO rows from a non-zero offset pays for a count. Rebuild the true
 *     mapping and fetch what is still missing — at most one extra read per
 *     stream, and only on the pages that cross a stream's end.
 */
export type InterleaveStream<T> = {
  /** Rows [from, from+want) in this stream's own order. */
  fetch(from: number, want: number): Promise<T[]>;
  /** Total rows in the stream; called only when a zero-row read hides it. */
  size(): Promise<number>;
};

export async function interleavePage<T>(
  a: InterleaveStream<T>,
  b: InterleaveStream<T>,
  offset: number,
  limit: number
): Promise<T[]> {
  if (limit <= 0) return [];

  // The window's positions under the both-streams-alive mapping — plus ONE
  // lookahead row per stream. The lookahead is what makes a full read a
  // PROOF: without it, a stream ending exactly at the window's edge (or a
  // zero-length optimistic range, which proves nothing at all) let the
  // pair-zone mapping claim one position past where the pairs really end —
  // caught by the every-window test at offset 15 of a 7-row stream.
  const aFrom = Math.ceil(offset / 2);
  const aWant = Math.ceil((offset + limit) / 2) - aFrom + 1;
  const bFrom = Math.floor(offset / 2);
  const bWant = Math.floor((offset + limit) / 2) - bFrom + 1;

  const [aRows, bRows] = await Promise.all([a.fetch(aFrom, aWant), b.fetch(bFrom, bWant)]);

  const aFull = aRows.length === aWant;
  const bFull = bRows.length === bWant;

  if (aFull && bFull) {
    // Neither stream ends inside the window: the optimistic mapping IS the
    // mapping. Walk the positions and deal from the two hands.
    const page: T[] = [];
    for (let m = offset; m < offset + limit; m++) {
      page.push(m % 2 === 0 ? aRows[(m >> 1) - aFrom] : bRows[(m >> 1) - bFrom]);
    }
    return page;
  }

  // At least one stream ended. Short-with-rows reveals the size exactly; a
  // zero-row read from offset 0 means empty; only zero rows from a real
  // offset needs the count.
  const sizeOf = async (
    stream: InterleaveStream<T>,
    rows: T[],
    from: number,
    want: number
  ): Promise<number | null> => {
    if (rows.length === want) return null; // ≥ from+want, exact value unknown
    if (rows.length > 0) return from + rows.length;
    return from === 0 ? 0 : await stream.size();
  };

  const [aSize, bSize] = await Promise.all([
    sizeOf(a, aRows, aFrom, aWant),
    sizeOf(b, bRows, bFrom, bWant),
  ]);

  const min = Math.min(aSize ?? Infinity, bSize ?? Infinity);
  // Which stream carries the tail. When both sizes are known and equal there
  // is no tail at all; `null` records that.
  const tail: "a" | "b" | null =
    aSize === null ? "a" : bSize === null ? "b" : aSize > bSize ? "a" : bSize > aSize ? "b" : null;

  // The true index each window position needs, or null past the end.
  const positions: Array<{ stream: "a" | "b"; i: number } | null> = [];
  for (let m = offset; m < offset + limit; m++) {
    if (m < 2 * min) {
      positions.push({ stream: m % 2 === 0 ? "a" : "b", i: m >> 1 });
    } else if (tail === null) {
      positions.push(null);
    } else {
      const i = m - min;
      const size = tail === "a" ? aSize : bSize;
      positions.push(size !== null && i >= size ? null : { stream: tail, i });
    }
  }

  // Fetch whatever the true mapping needs beyond what the optimistic read
  // already holds — one contiguous range per stream at most.
  const have = {
    a: new Map(aRows.map((r, i) => [aFrom + i, r])),
    b: new Map(bRows.map((r, i) => [bFrom + i, r])),
  };
  for (const key of ["a", "b"] as const) {
    const missing = positions
      .filter((p): p is { stream: "a" | "b"; i: number } => p !== null && p.stream === key)
      .map((p) => p.i)
      .filter((i) => !have[key].has(i));
    if (missing.length === 0) continue;
    const from = Math.min(...missing);
    const want = Math.max(...missing) - from + 1;
    const rows = await (key === "a" ? a : b).fetch(from, want);
    rows.forEach((r, i) => have[key].set(from + i, r));
  }

  const page: T[] = [];
  for (const p of positions) {
    if (p === null) continue;
    const row = have[p.stream].get(p.i);
    if (row !== undefined) page.push(row);
  }
  return page;
}
