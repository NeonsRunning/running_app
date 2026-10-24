#!/usr/bin/env node
/**
 * Where each SQL function is defined now.
 *
 * Migrations are append-only, so a function changed several times —
 * save_event() has been rewritten in a dozen of them — lives in full in each
 * one, and only the last counts. Changing it means copying that last
 * definition into a new migration; copying an older one silently drops
 * whatever came after (a column, a check). This lists, for every function,
 * the migration holding its current definition and how many times it has
 * been redefined.
 *
 *   npm run db:functions               every function
 *   npm run db:functions save_event    just the ones matching
 *
 * Dropped functions are not tracked; the list is of definitions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "supabase", "migrations");
const filter = process.argv[2]?.toLowerCase();

const DEFINITION = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi;

/** name → { file, line, count } of its latest definition. */
const latest = new Map();

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  for (const match of text.matchAll(DEFINITION)) {
    const name = match[1].toLowerCase();
    const line = text.slice(0, match.index).split("\n").length;
    const seen = latest.get(name);
    latest.set(name, { file, line, count: (seen?.count ?? 0) + 1 });
  }
}

const rows = [...latest]
  .filter(([name]) => !filter || name.includes(filter))
  .sort(([a], [b]) => a.localeCompare(b));

if (rows.length === 0) {
  console.log(filter ? `No function matches "${filter}".` : "No functions found.");
  process.exit(1);
}

const width = Math.max(...rows.map(([name]) => name.length));
for (const [name, { file, line, count }] of rows) {
  const times = count > 1 ? `  (defined ${count} times)` : "";
  console.log(`${name.padEnd(width)}  supabase/migrations/${file}:${line}${times}`);
}
