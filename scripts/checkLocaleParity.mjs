/**
 * Fails if messages/en.json, ru.json and lt.json don't have identical key sets.
 *
 * This is invariant #2 in ARCHITECTURE.md, and it is the one most likely to
 * break by accident: translations are edited by hand, often hundreds of lines
 * at a time, and a missing key doesn't crash anything — next-intl just renders
 * the raw key path, so a visitor sees "Terms.sections.11.title" where a
 * sentence should be. Nobody notices unless they happen to load that page in
 * that language.
 *
 * Run via `npm run check:locales`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const LOCALES = ["en", "ru", "lt"];
/** The locale every other one is compared against. */
const REFERENCE = "en";

/** Flattens nested objects to dotted paths. Arrays are treated as leaves —
 * their contents are translated copy, not structure, and their lengths are
 * checked separately below. */
function flatten(value, prefix = "") {
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...flatten(child, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/** Array-valued entries (FAQ items, service lists) must also match in length —
 * a locale with fewer entries silently renders a shorter list. */
function arrayLengths(value, prefix = "") {
  const lengths = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) {
      lengths[path] = child.length;
    } else if (child && typeof child === "object") {
      Object.assign(lengths, arrayLengths(child, path));
    }
  }
  return lengths;
}

const loaded = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")),
  ])
);

const referenceKeys = new Set(flatten(loaded[REFERENCE]));
const referenceArrays = arrayLengths(loaded[REFERENCE]);
const problems = [];

for (const locale of LOCALES.filter((l) => l !== REFERENCE)) {
  const keys = new Set(flatten(loaded[locale]));

  for (const key of referenceKeys) {
    if (!keys.has(key)) problems.push(`${locale}: missing key  ${key}`);
  }
  for (const key of keys) {
    if (!referenceKeys.has(key)) problems.push(`${locale}: unknown key ${key}`);
  }

  const arrays = arrayLengths(loaded[locale]);
  for (const [path, length] of Object.entries(referenceArrays)) {
    if (arrays[path] !== undefined && arrays[path] !== length) {
      problems.push(
        `${locale}: array ${path} has ${arrays[path]} items, ${REFERENCE} has ${length}`
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`Locale parity check FAILED (${problems.length} problems):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `\nEvery user-visible string must exist in all ${LOCALES.length} locales ` +
      `(${LOCALES.join(", ")}). See ARCHITECTURE.md invariant #2.`
  );
  process.exit(1);
}

console.log(
  `Locale parity OK — ${referenceKeys.size} keys identical across ${LOCALES.join(", ")}.`
);
