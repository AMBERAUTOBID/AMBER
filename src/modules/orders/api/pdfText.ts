import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * A PDF's text, reassembled into lines a parser can read.
 *
 * pdf.js hands back positioned fragments, not lines — the same receipt can
 * arrive as forty items in any order. Fragments are grouped by their Y
 * coordinate (rounded, because "the same line" often differs by a fraction
 * of a point), each group sorted by X, and groups emitted top-to-bottom.
 * That reproduces what a human reads, which is what `parseCopartReceipt`'s
 * label-then-amount patterns were written against.
 *
 * Server-only: the legacy pdf.js build runs in Node without a worker. Kept
 * apart from the pure parser so tests and client code never import it.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({
    data: bytes,
    // No worker in Node; pdf.js warns and runs on the main thread, which for
    // a one-page receipt is exactly right.
    useWorkerFetch: false,
  }).promise;

  const pages: string[] = [];
  {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();

      /** y (rounded) → fragments on that visual line. */
      const rows = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        const row = rows.get(y) ?? [];
        row.push({ x, text: item.str });
        rows.set(y, row);
      }

      const lines = [...rows.entries()]
        // PDF y grows upward; reading order is downward.
        .sort(([a], [b]) => b - a)
        .map(([, fragments]) =>
          fragments
            .sort((a, b) => a.x - b.x)
            .map((f) => f.text)
            .join("  ")
        );
      pages.push(lines.join("\n"));
    }
  }
  // pdf.js v6 in Node exposes cleanup on the loading task, not this proxy —
  // `doc.destroy` does not exist here. A one-page receipt leaks nothing
  // worth crashing over, so there is deliberately no destroy call.

  return pages.join("\n\n");
}
