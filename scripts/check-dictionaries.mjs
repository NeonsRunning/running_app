/**
 * Dictionary health check.
 *
 * Three failure modes this catches that TypeScript cannot:
 *   1. A key present in one locale and missing from the other.
 *   2. A `t("…")` call in the source with no matching dictionary entry — it
 *      would render the raw key to the user.
 *   3. A dictionary entry nothing references any more.
 *
 * Dotted keys built at runtime (`t(\`settings.prefs.${id}\`)`) cannot be read
 * statically, so their namespaces are listed in DYNAMIC_PREFIXES and skipped.
 *
 * Run with: node scripts/check-dictionaries.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const LOCALES = ["es", "en"];

/** Namespaces addressed through template literals or the label helpers. */
const DYNAMIC_PREFIXES = [
  // Auth errors arrive from the server as bare keys — `auth.errors.otpExpired`
  // for a whole-form failure, and a field name resolved against the form's own
  // namespace for the rest — so none of them appear as literals in the source.
  "auth.errors.",
  "auth.login.",
  "auth.signup.",
  "auth.forgot.",
  "auth.reset.",
  "auth.verify.",
  "labels.",
  "settings.prefs.",
  "notifications.kind.",
  "leaderboard.",
  "participants.columns.",
  "publish.steps.",
  "publish.checklist.",
  "register.steps.",
  "footer.",
  "account.",
  "tabs.",
  "nav.",
  "events.discovery.",
  "events.tabs.",
];

function flatten(node, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "scripts"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx?|mts)$/.test(full)) acc.push(full);
  }
  return acc;
}

const dicts = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(ROOT, "dictionaries", `${locale}.json`), "utf8")),
  ]),
);

const keys = Object.fromEntries(
  LOCALES.map((locale) => [locale, flatten(dicts[locale])]),
);

const problems = [];

// 1 — parity between locales.
for (const locale of LOCALES) {
  for (const other of LOCALES) {
    if (locale === other) continue;
    for (const key of keys[locale]) {
      if (!keys[other].has(key)) {
        problems.push(`missing in ${other}.json: ${key}`);
      }
    }
  }
}

// 2 and 3 — cross-reference the source.
const used = new Set();
const literal = /\bt(?:\.items|\.list|\.has)?\(\s*"([a-zA-Z0-9_.]+)"/g;

for (const file of sourceFiles(ROOT)) {
  const src = readFileSync(file, "utf8");
  for (const match of src.matchAll(literal)) used.add(match[1]);

  // Keys held in option tables: { key: "events.discovery.sortPrice" }
  for (const match of src.matchAll(/"([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4})"/g)) {
    const candidate = match[1];
    if (keys.es.has(candidate)) used.add(candidate);
  }

  const rel = relative(ROOT, file);
  for (const match of src.matchAll(literal)) {
    const key = match[1];
    const dynamic = DYNAMIC_PREFIXES.some((p) => key.startsWith(p));
    if (!dynamic && !keys.es.has(key)) {
      problems.push(`no dictionary entry for t("${key}") in ${rel}`);
    }
  }
}

const unused = [...keys.es].filter(
  (key) => !used.has(key) && !DYNAMIC_PREFIXES.some((p) => key.startsWith(p)),
);

console.log(`es keys: ${keys.es.size}   en keys: ${keys.en.size}`);

if (unused.length) {
  console.log(`\nunused (${unused.length}):`);
  for (const key of unused) console.log(`  ${key}`);
}

if (problems.length) {
  console.error(`\nproblems (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log("\nno parity or missing-key problems.");
