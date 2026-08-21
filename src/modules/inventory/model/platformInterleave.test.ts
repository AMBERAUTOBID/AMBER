import { describe, expect, it } from "vitest";
import { interleavePage, type InterleaveStream } from "./platformInterleave";

/** In-memory stream that also counts what it was asked. */
function fake(items: string[]) {
  const calls = { fetch: 0, size: 0 };
  const stream: InterleaveStream<string> = {
    async fetch(from, want) {
      calls.fetch++;
      return items.slice(from, from + want);
    },
    async size() {
      calls.size++;
      return items.length;
    },
  };
  return { stream, calls };
}

/** The merged order, built the slow obvious way — the spec the fast path must match. */
function reference(a: string[], b: string[]): string[] {
  const min = Math.min(a.length, b.length);
  const out: string[] = [];
  for (let i = 0; i < min; i++) out.push(a[i], b[i]);
  out.push(...(a.length > b.length ? a : b).slice(min));
  return out;
}

const label = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("interleavePage", () => {
  it("alternates strictly while both streams are long", async () => {
    const a = fake(label("A", 100)).stream;
    const b = fake(label("B", 100)).stream;
    expect(await interleavePage(a, b, 0, 6)).toEqual(["A0", "B0", "A1", "B1", "A2", "B2"]);
  });

  it("matches the reference merge for EVERY window over uneven streams", async () => {
    // 7 vs 23 — the short stream ends mid-page for several offsets, which is
    // exactly where pagination bugs live (repeated or dropped cars).
    const A = label("A", 7);
    const B = label("B", 23);
    const merged = reference(A, B);
    for (let offset = 0; offset <= merged.length + 2; offset++) {
      for (const limit of [1, 3, 5, 20]) {
        const page = await interleavePage(fake(A).stream, fake(B).stream, offset, limit);
        expect(page, `offset ${offset} limit ${limit}`).toEqual(merged.slice(offset, offset + limit));
      }
    }
  });

  it("walking consecutive pages covers every car exactly once", async () => {
    const A = label("A", 13);
    const B = label("B", 5);
    const seen: string[] = [];
    for (let offset = 0; offset < 20; offset += 4) {
      seen.push(...(await interleavePage(fake(A).stream, fake(B).stream, offset, 4)));
    }
    expect(seen).toEqual(reference(A, B));
  });

  it("serves a pure page when one stream is empty, without a count at offset 0", async () => {
    const a = fake([]);
    const b = fake(label("B", 10));
    expect(await interleavePage(a.stream, b.stream, 0, 4)).toEqual(["B0", "B1", "B2", "B3"]);
    expect(a.calls.size).toBe(0);
  });

  it("pays for a count only on a zero-row read from a real offset", async () => {
    const a = fake(label("A", 3));
    const b = fake(label("B", 40));
    // Deep page: the optimistic A read lands wholly past its end.
    const page = await interleavePage(a.stream, b.stream, 30, 5);
    expect(page).toEqual(reference(label("A", 3), label("B", 40)).slice(30, 35));
    expect(a.calls.size).toBe(1);
  });

  it("clips the final page instead of inventing rows", async () => {
    const A = label("A", 2);
    const B = label("B", 3);
    expect(await interleavePage(fake(A).stream, fake(B).stream, 4, 10)).toEqual(["B2"]);
    expect(await interleavePage(fake(A).stream, fake(B).stream, 5, 10)).toEqual([]);
  });

  it("needs only the two optimistic reads on an ordinary page", async () => {
    const a = fake(label("A", 50));
    const b = fake(label("B", 50));
    await interleavePage(a.stream, b.stream, 20, 20);
    expect(a.calls.fetch).toBe(1);
    expect(b.calls.fetch).toBe(1);
    expect(a.calls.size + b.calls.size).toBe(0);
  });
});
