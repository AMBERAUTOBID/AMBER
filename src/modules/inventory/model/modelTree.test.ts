import { describe, expect, it } from "vitest";
import {
  buildModelTree,
  canonicalKey,
  modelsForLabel,
  prettifyModel,
  type RawModelCount,
} from "./modelTree";

/** Real counts, read off the mirror on 2026-08-12. */
const BMW: RawModelCount[] = [
  { model: "X5", count: 525 },
  { model: "X3", count: 426 },
  { model: "3 SERIES", count: 385 },
  { model: "5 SERIES", count: 256 },
  { model: "328I", count: 199 },
  { model: "X1", count: 178 },
  { model: "M3", count: 61 },
  { model: "535I", count: 61 },
  { model: "330I", count: 57 },
  { model: "320I", count: 36 },
  { model: "M340I", count: 9 },
  { model: "750LI", count: 17 },
  { model: "7 SERIES", count: 111 },
  { model: "X5 M", count: 8 },
];

const FORD: RawModelCount[] = [
  { model: "F-150", count: 1543 },
  { model: "F150", count: 1342 },
  { model: "ESCAPE", count: 2384 },
  { model: "F-150 SUPER CAB", count: 12 },
];

const MERCEDES: RawModelCount[] = [
  { model: "C-CLASS", count: 379 },
  { model: "C 300", count: 225 },
  { model: "C 250", count: 52 },
  { model: "GLE-CLASS", count: 278 },
  { model: "GLE 350", count: 90 },
  { model: "M-CLASS", count: 125 },
  { model: "ML 350", count: 63 },
  { model: "SPRINTER", count: 176 },
];

const find = (tree: ReturnType<typeof buildModelTree>, label: string) =>
  tree.find((g) => g.label === label);

describe("canonicalKey", () => {
  it("makes the spellings of one car identical", () => {
    // The measurement that motivated the whole merge: 1,543 lots say F-150 and
    // 1,342 say F150, and a client picking one never saw the others.
    expect(canonicalKey("F-150")).toBe(canonicalKey("F150"));
    expect(canonicalKey("CR-V")).toBe(canonicalKey("CRV"));
    expect(canonicalKey("C 300")).toBe("C300");
  });

  it("keeps genuinely different models apart", () => {
    expect(canonicalKey("X5")).not.toBe(canonicalKey("X6"));
    expect(canonicalKey("328I")).not.toBe(canonicalKey("330I"));
  });
});

describe("prettifyModel", () => {
  it("title-cases real words", () => {
    expect(prettifyModel("3 SERIES")).toBe("3 Series");
    expect(prettifyModel("SILVERADO")).toBe("Silverado");
    expect(prettifyModel("GLE-CLASS")).toBe("GLE-Class");
    expect(prettifyModel("ALL OTHER")).toBe("All Other");
  });

  it("leaves names that are actually upper-case alone", () => {
    // These are how the cars are written on the cars.
    expect(prettifyModel("X5")).toBe("X5");
    expect(prettifyModel("RAV4")).toBe("RAV4");
    expect(prettifyModel("CR-V")).toBe("CR-V");
    expect(prettifyModel("F-150")).toBe("F-150");
    expect(prettifyModel("TT")).toBe("TT");
  });

  it("reads a digit-then-word name the way people write it", () => {
    expect(prettifyModel("4RUNNER")).toBe("4Runner");
  });
});

describe("buildModelTree", () => {
  it("files numeric trims under their series", () => {
    const tree = buildModelTree(BMW);
    const three = find(tree, "3 Series")!;
    expect(three.children.map((c) => c.label)).toEqual(["320I", "328I", "330I"]);
    // 385 of its own plus 199 + 57 + 36 — picking the family is meant to
    // return the trims too.
    expect(three.count).toBe(677);
  });

  it("does NOT file an M340i under the M3", () => {
    // The trap the word-boundary rule exists for: on the punctuation-stripped
    // key, M340I starts with M3. They are different cars at twice the price.
    const tree = buildModelTree(BMW);
    expect(find(tree, "M3")!.children).toHaveLength(0);
    expect(find(tree, "3 Series")!.children.map((c) => c.label)).not.toContain("M340I");
    // It is not lost, though — nothing ever is.
    expect(tree.some((g) => g.label === "M340I" || g.children.some((c) => c.label === "M340I")))
      .toBe(true);
  });

  it("groups by a word boundary, so X5 M sits under X5", () => {
    const tree = buildModelTree(BMW);
    const x5 = find(tree, "X5")!;
    expect(x5.children.map((c) => c.label)).toEqual(["X5 M"]);
    expect(x5.count).toBe(533);
  });

  it("merges the two spellings of one truck into one row", () => {
    const tree = buildModelTree(FORD);
    const f150 = find(tree, "F-150")!;
    // The commonest spelling is what the row is called...
    expect(f150.label).toBe("F-150");
    // ...and the query behind it matches both, plus the super cab under it.
    expect(f150.models).toContain("F-150");
    expect(f150.models).toContain("F150");
    expect(f150.count).toBe(1543 + 1342 + 12);
    expect(tree.some((g) => g.label === "F150")).toBe(false);
  });

  it("finds the class a Mercedes trim belongs to, shortening the prefix if it must", () => {
    const tree = buildModelTree(MERCEDES);
    expect(find(tree, "C-Class")!.children.map((c) => c.label)).toEqual(["C 250", "C 300"]);
    expect(find(tree, "GLE-Class")!.children.map((c) => c.label)).toEqual(["GLE 350"]);
    // ML 350 belongs to the M-Class; there is no "ML-CLASS" to find.
    expect(find(tree, "M-Class")!.children.map((c) => c.label)).toEqual(["ML 350"]);
  });

  it("does not let a two-lot scrap row adopt a whole class", () => {
    // Found by running the rules over the real catalogue rather than a
    // fixture. Mercedes publishes two lots as a bare "C" beside 379 as
    // "C-CLASS". The prefix rule filed the class under the scrap — and because
    // a parent that is itself a child is dropped, "C 300" was then thrown out
    // to the top level, away from the class it belongs to. 124 rows instead of
    // 67, with the biggest family in the make broken apart.
    const tree = buildModelTree([...MERCEDES, { model: "C", count: 2 }]);
    const cClass = find(tree, "C-Class")!;
    expect(cClass.children.map((c) => c.label)).toEqual(["C 250", "C 300"]);
    expect(find(tree, "C")!.children).toHaveLength(0);
  });

  it("leaves a model that matches no rule as its own row", () => {
    const tree = buildModelTree(MERCEDES);
    const sprinter = find(tree, "Sprinter")!;
    expect(sprinter.children).toHaveLength(0);
    expect(sprinter.count).toBe(176);
  });

  it("loses nothing at all", () => {
    // The property that makes the whole thing safe: the shape may be arguable,
    // the inventory may not. Every raw string, and every lot, is reachable.
    for (const rows of [BMW, FORD, MERCEDES]) {
      const tree = buildModelTree(rows);
      const reachable = new Set(tree.flatMap((g) => g.models));
      for (const row of rows) expect(reachable.has(row.model)).toBe(true);
      const total = rows.reduce((a, r) => a + r.count, 0);
      expect(tree.reduce((a, g) => a + g.count, 0)).toBe(total);
    }
  });

  it("reads in order, with the numbered families ahead of the lettered ones", () => {
    // The owner's requirement, and the reason: by inventory the BMW list read
    // "3 Series, X5, 5 Series, X3, X1, 7 Series, 4 Series, X6" — every number
    // right, nothing findable. `numeric: true` is what keeps "3 Series" above
    // "10 Series" rather than below it.
    const tree = buildModelTree([
      ...BMW,
      { model: "10 SERIES", count: 1 },
      { model: "Z4", count: 26 },
    ]);
    const labels = tree.map((g) => g.label);
    expect(labels.slice(0, 5)).toEqual(["3 Series", "5 Series", "7 Series", "10 Series", "M3"]);
    expect(labels.indexOf("M3")).toBeLessThan(labels.indexOf("X1"));
    expect(labels.indexOf("X1")).toBeLessThan(labels.indexOf("Z4"));
  });

  it("sinks the auctions' catch-all buckets below real models", () => {
    // "ALL OTHER" holds 113 Toyotas, so it stays in the list — but sorted as a
    // word it landed above Avalon and Camry, at the top of the make a visitor
    // opens most.
    const tree = buildModelTree([
      { model: "ALL OTHER", count: 113 },
      { model: "ALL MODELS", count: 18 },
      { model: "CAMRY", count: 3590 },
      { model: "AVALON", count: 379 },
    ]);
    expect(tree.map((g) => g.label)).toEqual(["Avalon", "Camry", "All Models", "All Other"]);
  });

  it("orders the cars inside a family the same way", () => {
    const tree = buildModelTree(BMW);
    expect(find(tree, "3 Series")!.children.map((c) => c.label)).toEqual([
      "320I",
      "328I",
      "330I",
    ]);
  });

  it("survives an empty or junk model list", () => {
    expect(buildModelTree([])).toEqual([]);
    expect(buildModelTree([{ model: "  ", count: 3 }])).toEqual([]);
  });
});

describe("modelsForLabel", () => {
  it("expands a family into every spelling of every car in it", () => {
    const tree = buildModelTree(BMW);
    const models = modelsForLabel(tree, "3 Series");
    expect(models).toEqual(expect.arrayContaining(["3 SERIES", "328I", "330I", "320I"]));
    expect(models).not.toContain("M340I");
  });

  it("expands a single car to its spellings only", () => {
    const tree = buildModelTree(FORD);
    expect(modelsForLabel(tree, "Escape")).toEqual(["ESCAPE"]);
  });

  it("is case-insensitive, because the label arrives from a URL", () => {
    const tree = buildModelTree(BMW);
    expect(modelsForLabel(tree, "3 series")).toEqual(modelsForLabel(tree, "3 Series"));
  });

  it("returns nothing for a label that is not in the tree", () => {
    // The caller must treat this as "match nothing" rather than "no filter" —
    // a mistyped URL should return no cars, not the whole catalogue.
    expect(modelsForLabel(buildModelTree(BMW), "Corvette")).toEqual([]);
  });
});
