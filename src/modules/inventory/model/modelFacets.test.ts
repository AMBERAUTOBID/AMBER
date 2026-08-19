import { describe, expect, it } from "vitest";
import { buildModelTree } from "./modelTree";
import { flattenModelTree, treeFromOptions } from "./modelFacets";

/**
 * The model tree crosses the server/browser boundary as a flat list, and these
 * two functions are the only thing keeping it intact.
 *
 * THE ROUND TRIP IS THE TEST. Either half can be read and believed on its own;
 * only together can they be wrong in the way that matters — a family that loses
 * its trims, or a trim that escapes to the top level and reads as a car of its
 * own. So the assertions run a real tree through both and compare, rather than
 * checking each half against a hand-written fixture that would have to be kept
 * in step with the encoding it is describing.
 */

/** Shaped like the rows the mirror returns for one make. */
const BMW_ROWS = [
  { model: "3 SERIES", count: 385 },
  { model: "328I", count: 199 },
  { model: "330I", count: 57 },
  { model: "X5", count: 553 },
  { model: "X5 M", count: 12 },
  { model: "M340I", count: 8 },
];

describe("flattenModelTree / treeFromOptions", () => {
  it("survives the round trip with its families intact", () => {
    const tree = buildModelTree(BMW_ROWS);
    const back = treeFromOptions(flattenModelTree(tree));

    expect(back.map((g) => g.label)).toEqual(tree.map((g) => g.label));
    for (const [i, group] of tree.entries()) {
      expect(back[i].count).toBe(group.count);
      expect(back[i].children.map((c) => c.label)).toEqual(group.children.map((c) => c.label));
      expect(back[i].children.map((c) => c.count)).toEqual(group.children.map((c) => c.count));
    }
  });

  it("puts the trims under their family and not beside it", () => {
    const flat = flattenModelTree(buildModelTree(BMW_ROWS));
    expect(flat.find((o) => o.value === "3 Series")?.parent).toBeUndefined();
    expect(flat.find((o) => o.value === "328I")?.parent).toBe("3 Series");
    expect(flat.find((o) => o.value === "330I")?.parent).toBe("3 Series");
    // Every parent is emitted before the children that name it — the property
    // `treeFromOptions` relies on to rebuild in one pass.
    for (const [i, option] of flat.entries()) {
      if (!option.parent) continue;
      expect(flat.slice(0, i).some((o) => o.value === option.parent)).toBe(true);
    }
  });

  it("keeps the family's own count, which includes its children", () => {
    const flat = flattenModelTree(buildModelTree(BMW_ROWS));
    // 385 + 199 + 57 — picking the family is meant to return its trims too.
    expect(flat.find((o) => o.value === "3 Series")?.count).toBe(385 + 199 + 57);
  });

  /**
   * ⚠️ RECORDING WHAT THE TREE ACTUALLY DOES, not what it ought to.
   *
   * `M340i` is a 3 Series and the tree files it at the top level. None of the
   * three rules reaches it: the numeric rule wants a bare `328`-shaped key, the
   * class rule looks for `M-CLASS`, and the prefix rule works on display strings
   * where "M340I" does not begin with "3 Series". Filing it under the M3 instead
   * would be the far worse error — a different car at twice the price — and
   * `prefixParent` refuses that deliberately.
   *
   * Written down so that a later change to `modelTree` which starts nesting it
   * fails here loudly rather than quietly, and someone has to decide.
   */
  it("leaves M340I at the top level, where the rules put it", () => {
    const flat = flattenModelTree(buildModelTree(BMW_ROWS));
    expect(flat.find((o) => o.value === "M340I")?.parent).toBeUndefined();
  });

  it("keeps a child whose parent never arrived, as a row of its own", () => {
    // A truncated payload. Losing the model silently is the one failure this
    // list must not have.
    const back = treeFromOptions([{ value: "328I", count: 199, parent: "3 Series" }]);
    expect(back.map((g) => g.label)).toEqual(["328I"]);
    expect(back[0].children).toEqual([]);
  });

  it("returns nothing for nothing", () => {
    expect(treeFromOptions([])).toEqual([]);
    expect(flattenModelTree([])).toEqual([]);
  });
});
