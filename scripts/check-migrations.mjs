#!/usr/bin/env node
/**
 * Migrations must be added at the end.
 *
 * `supabase db push` applies what the project has not seen, in version order,
 * and refuses a file older than one already applied. Pushed anyway
 * (`--include-all`), production runs it last while a fresh database — CI,
 * local — runs it in its place, where a later migration's `create or
 * replace` silently overwrites it. The two schemas then differ with nothing
 * to show for it.
 *
 * The versions here are numbered by hand and run ahead of the calendar, so
 * `supabase migration new`, which stamps today's date, makes exactly that
 * file. This fails when one does.
 *
 *   npm run check:migrations                 names and duplicates only
 *   npm run check:migrations -- origin/main  also: nothing added before
 *                                            the newest migration on that ref
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = "supabase/migrations";
const base = process.argv[2];

const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const problems = [];

const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".sql"));
const seen = new Map();
for (const file of files) {
  const version = NAME.exec(file)?.[1];
  if (!version) {
    problems.push(`${file}: name must be <14 digits>_<lower_snake_case>.sql`);
    continue;
  }
  if (seen.has(version)) {
    problems.push(`${file}: same version as ${seen.get(version)}`);
  }
  seen.set(version, file);
}

if (base) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const versionOf = (file) => NAME.exec(path.posix.basename(file))?.[1];

  const existing = git("ls-tree", "-r", "--name-only", base, "--", dir)
    .map(versionOf)
    .filter(Boolean)
    .sort();
  const newest = existing.at(-1);
  const added = git("diff", "--name-only", "--diff-filter=A", `${base}...HEAD`, "--", dir);

  for (const file of added) {
    const version = versionOf(file);
    if (newest && version && version <= newest) {
      problems.push(
        `${path.posix.basename(file)}: sorts before the newest migration on ${base} ` +
          `(${newest}). Rename it to a version after that one.`,
      );
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `${files.length} migrations, newest ${[...seen.keys()].sort().at(-1)}` +
    (base ? `; nothing added before the newest on ${base}.` : "."),
);
