/**
 * How a model tree survives the trip from the server to the picker.
 *
 * `SearchFacets` is a flat list of `{ value, count }` per dimension, and models
 * are the one dimension with shape: a family that opens into the exact cars
 * inside it. Rather than widen that type into a record of two different things —
 * which the panel, the chips and their tests all read — a model option carries
 * an optional `parent`, and these two functions are the encoding and its
 * inverse.
 *
 * BOTH HALVES LIVE HERE, TOGETHER, and that is the point: they are only correct
 * with respect to each other, and the round trip is what the test asserts.
 * `flattenModelTree` runs on the server inside `makeModelFacets`; `treeFromOptions`
 * runs in the browser inside `FilterControls`. Split across those two files the
 * pair would have no single place to be checked, and a disagreement between them
 * shows up as a model list that is quietly missing its trims.
 *
 * Pure, React-free and database-free — the same reason `filterQuery.ts` sits in
 * this folder rather than beside the component that renders it.
 */

import type { FacetOption } from "@/modules/inventory/api/source";
import type { ModelGroup } from "./modelTree";

/**
 * Groups first, each immediately followed by the exact cars inside it.
 *
 * ⚠️ `models` — the raw spellings a label covers — IS DELIBERATELY NOT CARRIED.
 * It is only ever needed on the server, where `resolveModels` rebuilds it from
 * the whole catalogue, and sending it would put thousands of strings the picker
 * never reads into every search page's payload.
 */
export function flattenModelTree(tree: ModelGroup[]): FacetOption[] {
  const out: FacetOption[] = [];
  for (const group of tree) {
    out.push({ value: group.label, count: group.count });
    for (const child of group.children) {
      out.push({ value: child.label, count: child.count, parent: group.label });
    }
  }
  return out;
}

/**
 * The tree again, in the order it was flattened in.
 *
 * A child whose parent is missing becomes a row of its own rather than being
 * dropped. It cannot normally happen — the encoder emits every parent before
 * its children — but a model silently disappearing from the picker is the one
 * failure this list must not have, and a truncated payload is not a reason to
 * hide inventory.
 */
export function treeFromOptions(options: readonly FacetOption[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  const orphans: ModelGroup[] = [];
  for (const o of options) {
    if (o.parent === undefined) {
      groups.set(o.value, { label: o.value, models: [], count: o.count, children: [] });
      continue;
    }
    const parent = groups.get(o.parent);
    const child = { label: o.value, models: [], count: o.count };
    if (parent) parent.children.push(child);
    else orphans.push({ ...child, children: [] });
  }
  return [...groups.values(), ...orphans];
}
