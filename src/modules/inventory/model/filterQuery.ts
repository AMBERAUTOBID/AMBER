/**
 * How a facet selection is written into, and read out of, the search URL.
 *
 * Lives in `model/` rather than beside the component that renders it because it
 * is pure string handling with no React and no Next in it. That is not a
 * cosmetic split: the first attempt kept these in `FilterPanel.tsx`, and the
 * test could not import them at all — pulling in the component drags in
 * `next-intl`'s navigation, which does not resolve outside a Next build. Logic
 * that decides what a filter link does should be testable without a framework.
 *
 * The filter panel holds NO client state; every option is a link whose href
 * these functions compute. So a bug here is not a cosmetic glitch — it is a
 * filter that cannot be switched off, or one that quietly discards the other
 * choices a visitor already made.
 */

/**
 * The values currently selected for one dimension.
 *
 * Tolerant of what a hand-edited or truncated URL produces: empty segments and
 * stray spaces are dropped rather than becoming empty selections, which would
 * send `fuel=gasoline,` to the server and match nothing.
 */
export function parseSelected(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * The current query with one value flipped in or out of a comma-separated
 * param. Every other filter is carried through untouched.
 *
 * Always drops `cursor`: page 5 of the old result set is meaningless once the
 * filters change, and keeping it is how a visitor lands on an empty page
 * immediately after narrowing.
 *
 * Removing the last value deletes the param rather than leaving `fuel=` behind,
 * so the server never has to decide what an empty filter means.
 */
export function toggleHref(
  base: Record<string, string>,
  param: string,
  value: string
): { pathname: string; query: Record<string, string> } {
  const selected = parseSelected(base[param]);
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);

  const query: Record<string, string> = { ...base };
  delete query.cursor;
  if (selected.size > 0) query[param] = [...selected].join(",");
  else delete query[param];

  return { pathname: "/search", query };
}
