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
 * Email copy goes through a per-template key helper —
 * `const k = (key: string) => \`emails.raceReminder.${key}\`` — and `t(k("…"))`
 * calls. Those are checked too: each `k("…")` is resolved against the helper
 * defined above it in the same file, including a helper that picks its
 * template with a ternary or a `template` variable. Such a helper can name
 * several templates, and some keys belong to one branch only (a payment's
 * amount, a rejection's note), so there a key must exist under at least one
 * of them; `lib/email/templates.test.ts` renders every branch for the rest.
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
  "settings.errors.",
  "settings.prefs.",
  "notifications.kind.",
  "leaderboard.",
  // Check-in errors, as keys from the action.
  "checkin.errors.",
  "publish.steps.",
  "publish.checklist.",
  "publish.errors.",
  "publish.countries.",
  // `ImageStep` labels, one section per image field.
  "publish.image.",
  "publish.routeImage.",
  "publish.medalImage.",
  "register.steps.",
  "register.errors.",
  "adminPayments.errors.",
  // ATH Móvil account errors, as keys from the actions and the form.
  "adminAccounts.errors.",
  // Removal errors arrive from the server as keys; blockers are picked by code.
  "adminEvents.errors.",
  "adminEvents.blocked.",
  "eventPayments.errors.",
  "eventRegistrations.errors.",
  "eventRegistrations.pendingErrors.",
  "eventRegistrations.shipErrors.",
  "footer.",
  "account.",
  "tabs.",
  "nav.",
  "events.discovery.",
  "events.tabs.",
  // Picked by refund reason: `k(\`reasons.${reason}\`)`.
  "emails.paymentRefunded.reasons.",
  // Profile photo: upload phases and error codes from the action.
  "runner.photo.",
  // Medal delivery errors, as keys from the action.
  "runner.medalDeliveryErrors.",
  // Finish evidence: upload phases and error codes from the actions.
  "raceResult.phase.",
  "raceResult.errors.",
  "resultReview.errors.",
  "resultFinishers.errors.",
  // Keys the contact action returns: `contactForm.errors.${result.error}`.
  "contactForm.errors.",
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

/** `const k = (key: string) => \`emails.<template>.${key}\``, across lines. */
const keyHelper = /const k = \(key: string\) =>\s*`([^`]*)\$\{key\}`/g;
const keyCall = /\bk\(([^()]*)\)/g;
const quoted = /"([a-zA-Z0-9_.]+)"/g;
/** The results of a ternary: `a === "x" ? "y" : "z"` gives y and z, not x. */
const branch = /[?:]\s*"([a-zA-Z0-9_.]+)"/g;

/** The strings an expression can evaluate to. */
function outcomes(expression) {
  const pattern = expression.includes("?") ? branch : quoted;
  return [...expression.matchAll(pattern)].map((m) => m[1]);
}

/**
 * Every prefix a helper can produce. `emails.raceReminder.` as it stands; a
 * `${…}` inside is a ternary or a variable, and resolves to each quoted
 * string in it — or, for a bare name, in that name's `const` in the file.
 */
function helperPrefixes(template, src) {
  const hole = template.match(/\$\{([^}]*)\}/);
  if (!hole) return [template];
  let options = outcomes(hole[1]);
  if (!options.length && /^\s*\w+\s*$/.test(hole[1])) {
    const decl = src.match(new RegExp(`const ${hole[1].trim()}\\s*=([^;]*);`));
    options = decl ? outcomes(decl[1]) : [];
  }
  return options.map((o) => template.replace(hole[0], o));
}

/**
 * The `k("…")` calls in a file, each resolved through the helper above it:
 * one entry per call and name, with every key it could be.
 */
function helperKeys(src) {
  const helpers = [...src.matchAll(keyHelper)].map((m) => ({
    at: m.index,
    prefixes: helperPrefixes(m[1], src),
  }));
  if (!helpers.length) return [];
  const out = [];
  for (const call of src.matchAll(keyCall)) {
    const helper = helpers.filter((h) => h.at < call.index).at(-1);
    if (!helper) continue;
    for (const name of outcomes(call[1])) {
      out.push(helper.prefixes.map((prefix) => prefix + name));
    }
  }
  return out;
}

for (const file of sourceFiles(ROOT)) {
  const src = readFileSync(file, "utf8");
  for (const match of src.matchAll(literal)) used.add(match[1]);

  // Keys held in option tables: { key: "events.discovery.sortPrice" }
  for (const match of src.matchAll(/"([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4})"/g)) {
    const candidate = match[1];
    if (keys.es.has(candidate)) used.add(candidate);
  }

  const rel = relative(ROOT, file);
  for (const candidates of helperKeys(src)) {
    const found = candidates.filter((key) => keys.es.has(key));
    for (const key of found) used.add(key);
    if (!found.length) {
      problems.push(`no dictionary entry for k(…) key "${candidates.join('" or "')}" in ${rel}`);
    }
  }
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
