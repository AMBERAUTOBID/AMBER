/**
 * Turns the model strings the auctions actually publish into the two-level list
 * a person can shop from: a family ("3 Series"), and the exact cars under it
 * ("328i", "330i", "320i").
 *
 * WHY THIS EXISTS AT ALL. The picker used to offer a hand-typed list — 14 BMW
 * models against the 171 our own rows hold, with X6, X2, X4, 328i and 535i
 * simply missing. The catalogue is ours, so the list should be derived from it.
 * But the raw strings cannot be shown as they are, for two reasons measured on
 * 2026-08-12:
 *
 *  - **The same car is spelled two ways, and both are common.** Ford `F-150`
 *    1,543 lots and `F150` 1,342. Honda `CR-V` 1,139 and `CRV` 1,001. Offering
 *    both, a client picks one and never sees half the trucks. So punctuation is
 *    stripped to a canonical key and the spellings are merged into one entry
 *    whose query matches every spelling it covers.
 *  - **Families and their trims sit side by side as equals.** BMW publishes
 *    `3 SERIES` (385) next to `328I` (199) and `330I` (57); Mercedes publishes
 *    `C-CLASS` next to `C 300`. Flat, that is 171 rows of noise; nested, it is
 *    a dozen families you can open.
 *
 * NOTHING IS EVER DROPPED. Every raw string ends up either as a family or
 * inside one — a model that matches no rule becomes its own entry. That is the
 * property that makes this safe: the list can be wrong about *shape* without
 * ever being wrong about *inventory*.
 *
 * Pure and database-free, so the rules are testable without a connection.
 */

export interface RawModelCount {
  /** Exactly as the auction publishes it. */
  model: string;
  count: number;
}

/** One car as a shopper thinks of it, possibly spelled several ways upstream. */
export interface ModelEntry {
  /** What the list shows. */
  label: string;
  /** Every raw string this covers — what a query must match. */
  models: string[];
  count: number;
}

export interface ModelGroup extends ModelEntry {
  /**
   * The exact cars inside a family, empty for a model that is not one. A group
   * with no children renders as a plain row, not something to expand.
   *
   * `models` and `count` on the group INCLUDE the children: picking "3 Series"
   * is meant to return 328i and 330i as well, which is what a person expects
   * and what Autotrader does.
   */
  children: ModelEntry[];
}

/**
 * How every list here is ordered: naturally, the way a person reads a
 * catalogue rather than the way a database returns one.
 *
 * `numeric: true` is what makes "3 Series" sort before "10 Series" instead of
 * after it, and it puts the numbered families ahead of the lettered ones — so a
 * BMW reads 1, 2, 3, 4, 5, 7 Series, then M2…M5, X1…X7, Z4, which is the shape
 * the owner asked for. Sorting by inventory instead put "3 Series, X5, 5
 * Series, X3, X1, 7 Series, 4 Series, X6" on screen: every number correct, and
 * nothing findable.
 */
const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * The auctions' own catch-all buckets. They hold real cars — 113 Toyotas sit
 * under "ALL OTHER" — so they are kept, but they are not model names and must
 * not outrank one: alphabetically "All Models" and "All Other" landed above
 * Avalon and Camry, which is the first thing a visitor sees.
 */
const CATCH_ALL = /^all (other|models)$/i;

export function compareLabels(a: string, b: string): number {
  const rank = (s: string) => (CATCH_ALL.test(s) ? 1 : 0);
  return rank(a) - rank(b) || naturalOrder.compare(a, b);
}

/** Punctuation and case removed: `F-150`, `F 150` and `f150` are one car. */
export function canonicalKey(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Short English words that turn up inside model names and are NOT initialisms.
 *
 * Without this, the "three letters or fewer stays upper-case" rule below reads
 * Toyota's own `ALL OTHER` bucket as "ALL Other". Kept deliberately tiny: every
 * entry is a word observed in the catalogue, not a guess at what might appear.
 */
// Three letters or fewer normally stay upper-case (X5, GLE, CR-V), so anything
// that is a real word — or a make written in mixed case everywhere, like Kia
// and Ram — has to be named here or it shouts.
const SHORT_WORDS = new Set(["ALL", "AND", "BUS", "CAB", "FOR", "KIA", "NEW", "RAM", "THE", "VAN"]);

/**
 * Readable casing without losing the names that are genuinely upper-case.
 *
 * `SILVERADO` should read "Silverado", but `GLE`, `X5`, `RAV4`, `CR-V` and
 * `F-150` are how those cars are written everywhere, including on the car. The
 * rule that separates them: a part containing a digit, or three letters or
 * fewer, stays as it is — unless it is one of the short words above.
 */
export function prettifyModel(model: string): string {
  return model
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split(/([-/])/)
        .map((part) => {
          if (part === "-" || part === "/") return part;
          // 4RUNNER, 3ROW — a digit then a real word reads better title-cased.
          const digitWord = /^(\d+)([A-Z]{3,})$/.exec(part);
          if (digitWord) {
            return digitWord[1] + digitWord[2][0] + digitWord[2].slice(1).toLowerCase();
          }
          if (/\d/.test(part) || (part.length <= 3 && !SHORT_WORDS.has(part.toUpperCase()))) {
            return part;
          }
          return part[0] + part.slice(1).toLowerCase();
        })
        .join("")
    )
    .join(" ");
}

/**
 * The same merge, one level up: makes are spelled several ways too.
 *
 * Measured 2026-08-12 — 27 makes are one marque under two or three spellings,
 * and 132 lots sit under the minority one. `MERCEDES BENZ` (43) beside
 * `MERCEDES-BENZ` (3,797), `HARLEY DAVIDSON` (2) beside `HARLEY-DAVIDSON`
 * (689), `SEA DOO` / `SEA-DOO` / `SEADOO` three ways. Left alone, the picker
 * lists the same marque twice and each entry hides the other's cars.
 *
 * The label is prettified because a make is a proper noun and the auctions
 * shout: "MERCEDES-BENZ" becomes "Mercedes-Benz" while "BMW" and "GMC" stay as
 * they are. Safe to change, because a picked label is resolved back through
 * `canonicalKey` rather than compared to the column.
 */
export function mergeMakeSpellings(
  rows: Array<{ make: string; count: number }>
): Array<{ label: string; makes: string[]; count: number }> {
  const byKey = new Map<string, { spellings: Array<{ make: string; count: number }>; count: number }>();
  for (const row of rows) {
    const key = canonicalKey(row.make);
    if (key.length === 0) continue;
    const bucket = byKey.get(key) ?? { spellings: [], count: 0 };
    bucket.spellings.push(row);
    bucket.count += row.count;
    byKey.set(key, bucket);
  }
  return [...byKey.values()]
    .map((bucket) => {
      const dominant = bucket.spellings.reduce((a, b) => (b.count > a.count ? b : a));
      return {
        label: prettifyModel(dominant.make),
        makes: bucket.spellings.map((s) => s.make),
        count: bucket.count,
      };
    })
    .sort((a, b) => compareLabels(a.label, b.label));
}

/** Merges the spellings of one car into a single entry. */
function mergeSpellings(rows: RawModelCount[]): Map<string, ModelEntry> {
  const byKey = new Map<string, { spellings: RawModelCount[]; count: number }>();
  for (const row of rows) {
    const key = canonicalKey(row.model);
    if (key.length === 0) continue;
    const bucket = byKey.get(key) ?? { spellings: [], count: 0 };
    bucket.spellings.push(row);
    bucket.count += row.count;
    byKey.set(key, bucket);
  }

  const entries = new Map<string, ModelEntry>();
  for (const [key, bucket] of byKey) {
    // The commonest spelling wins the label: if 1,543 lots say F-150 and 1,342
    // say F150, the hyphen is what people recognise.
    const dominant = bucket.spellings.reduce((a, b) => (b.count > a.count ? b : a));
    entries.set(key, {
      label: prettifyModel(dominant.model),
      models: bucket.spellings.map((s) => s.model),
      count: bucket.count,
    });
  }
  return entries;
}

/**
 * Which family a model belongs to, or null if it is one itself.
 *
 * Every rule is CONDITIONAL ON THE FAMILY EXISTING in this make's own data, so
 * none of them can invent a grouping: if a make has no `3 SERIES`, its `328I`
 * stays where it is. That is what lets the same three rules run against all
 * 1,316 makes without a per-brand table.
 */
function parentKeyFor(key: string, entries: Map<string, ModelEntry>): string | null {
  // BMW and its relatives: 328I, 535I, 750LI → "<first digit> SERIES".
  const numeric = /^(\d)\d{2}[A-Z]*$/.exec(key);
  if (numeric && entries.has(`${numeric[1]}SERIES`)) return `${numeric[1]}SERIES`;

  // Mercedes and its relatives: C300 → C-CLASS, GLE350 → GLE-CLASS. The letter
  // prefix is shortened one character at a time so ML350 finds M-CLASS, which
  // is the name that class actually has.
  const lettered = /^([A-Z]{1,4})\d/.exec(key);
  if (lettered) {
    for (let end = lettered[1].length; end >= 1; end--) {
      const candidate = `${lettered[1].slice(0, end)}CLASS`;
      if (entries.has(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * The generic rule, run on the DISPLAY strings rather than the canonical keys:
 * "Silverado 1500" belongs under "Silverado", "Accord Hybrid" under "Accord",
 * "X5 M" under "X5".
 *
 * ON THE DISPLAY STRING, AND THE WORD BOUNDARY IS THE WHOLE POINT. Against the
 * punctuation-stripped key, `M340I` starts with `M3` and would file a 3 Series
 * under the M3 — a different car at twice the price. Requiring a space or a
 * hyphen at the join makes "Silverado 1500" match and "M340i" not.
 */
function prefixParent(entry: ModelEntry, all: ModelEntry[]): ModelEntry | null {
  let best: ModelEntry | null = null;
  for (const candidate of all) {
    if (candidate === entry) continue;
    const prefix = candidate.label;
    if (entry.label.length <= prefix.length) continue;
    if (!entry.label.startsWith(prefix)) continue;
    const boundary = entry.label[prefix.length];
    if (boundary !== " " && boundary !== "-") continue;
    // A FAMILY IS NEVER RARER THAN THE CAR INSIDE IT. Measured over the whole
    // catalogue: Mercedes publishes two lots as a bare "C" and 378 as
    // "C-CLASS", and without this the two-lot row adopted the entire C-Class —
    // which then pushed "C 300" out to the top level, because its own parent
    // had become a child. The class and series rules above are exempt: a
    // 1 Series is the right home for a 128i however few of each we hold.
    if (candidate.count < entry.count) continue;
    // Longest wins: with both "F-150" and "F-150 Super", the closer parent is
    // the more specific one.
    if (!best || prefix.length > best.label.length) best = candidate;
  }
  return best;
}

/**
 * The finished list for one make, in reading order — see `compareLabels`.
 *
 * The count still decides one thing, just not the order: which spelling of a
 * merged car gets to be its label.
 */
export function buildModelTree(rows: RawModelCount[]): ModelGroup[] {
  const entries = mergeSpellings(rows);
  const all = [...entries.values()].sort((a, b) => b.count - a.count);

  const parentOf = new Map<ModelEntry, ModelEntry>();
  for (const [key, entry] of entries) {
    const byRule = parentKeyFor(key, entries);
    const parent = byRule ? entries.get(byRule) : prefixParent(entry, all);
    // A parent that is itself a child would make a three-level list out of a
    // two-level one; keep the tree flat by ignoring the deeper link.
    if (parent && parent !== entry) parentOf.set(entry, parent);
  }
  for (const [child, parent] of parentOf) {
    if (parentOf.has(parent)) parentOf.delete(child);
  }

  const groups = new Map<ModelEntry, ModelGroup>();
  for (const entry of all) {
    if (parentOf.has(entry)) continue;
    groups.set(entry, { ...entry, models: [...entry.models], children: [] });
  }
  for (const [child, parent] of parentOf) {
    const group = groups.get(parent);
    if (!group) continue;
    group.children.push(child);
    group.models.push(...child.models);
    group.count += child.count;
  }

  for (const group of groups.values()) {
    group.children.sort((a, b) => compareLabels(a.label, b.label));
  }
  return [...groups.values()].sort((a, b) => compareLabels(a.label, b.label));
}

/**
 * The raw strings a selection stands for.
 *
 * The URL carries the LABEL a visitor picked — short, readable, shareable — and
 * the server turns it back into every spelling it covers. Matching the label
 * against the column directly would be wrong twice over: it would miss `F150`
 * when the label says `F-150`, and it would miss every trim under a family.
 */
export function modelsForLabel(tree: ModelGroup[], label: string): string[] {
  const wanted = label.trim().toLowerCase();
  for (const group of tree) {
    if (group.label.toLowerCase() === wanted) return group.models;
    for (const child of group.children) {
      if (child.label.toLowerCase() === wanted) return child.models;
    }
  }
  return [];
}

/**
 * A lot's headline, as a person would write it.
 *
 * ⚠️ THE SOURCES SHOUT. Both the aggregator and our own mirror carry make and
 * model in upper case, so a card read "2023 FERRARI ALL OTHER" where the
 * competitor reads "2023 Ferrari". Two separate faults in one string:
 *
 *  - **Case.** `prettifyModel` already solved this for the model picker and is
 *    reused rather than reinvented — it knows that `X5`, `GT-R` and `4WD` are
 *    written that way on the car itself, and only `SILVERADO` needs lowering.
 *  - **The catch-all buckets.** `ALL OTHER` and `ALL MODELS` are the auctions'
 *    own dumping grounds, not model names — 113 Toyotas sit in one of them.
 *    They are worth keeping in a filter list, where they are a real choice, and
 *    worth dropping from a headline, where they read as broken data. Anchored
 *    at the end so a genuine model that happens to contain the words survives.
 */
export function formatLotTitle(raw: string): string {
  const pretty = prettifyModel(raw);
  const trimmed = pretty.replace(/\s+All (?:Other|Models)$/i, "").trim();
  // Never return an empty headline: a lot whose whole title is a catch-all
  // keeps it, because "" on a card is worse than a vague label.
  return trimmed || pretty;
}
