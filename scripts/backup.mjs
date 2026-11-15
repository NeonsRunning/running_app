#!/usr/bin/env node
/**
 * Back up the production database and every storage bucket to this computer.
 *
 * Stands in for Supabase's paid backups. Writes, under the backup folder:
 *
 *   db/<timestamp>/roles.sql    cluster roles
 *   db/<timestamp>/schema.sql   tables, functions, policies
 *   db/<timestamp>/data.sql     every row, auth users and storage records included
 *   storage/<bucket>/...        a mirror of each bucket's files
 *
 * The database is dumped whole on every run and the oldest dumps are pruned.
 * Storage is a mirror: only new or changed files are downloaded, and a file
 * deleted from the bucket is kept here, so a mistaken delete stays recoverable.
 *
 *   npm run backup              both
 *   npm run backup -- db        database only
 *   npm run backup -- storage   buckets only
 *
 * Needs Docker running and the Supabase CLI logged in and linked (the dump
 * runs pg_dump in a container), plus NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local or .env.
 *
 *   BACKUP_DIR    where to write; default ../running_app_backups
 *   BACKUP_KEEP   database dumps to keep; default 30
 *
 * To restore the database into a fresh project, see
 * https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

for (const file of [".env.local", ".env"]) {
  const envPath = path.join(root, file);
  // Earlier files win: loadEnvFile never overwrites a variable already set.
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const dest = path.resolve(
  process.env.BACKUP_DIR || path.join(root, "..", "running_app_backups"),
);
const keep = Number(process.env.BACKUP_KEEP) || 30;
const only = process.argv[2];
if (only && only !== "db" && only !== "storage") {
  console.error(`Unknown target "${only}". Use "db", "storage" or nothing for both.`);
  process.exit(1);
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function backupDatabase() {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "-");
  const dbRoot = path.join(dest, "db");
  // Dump into a scratch folder and rename at the end, so a dump that failed
  // half-way is never mistaken for a backup (or counted by the pruning).
  const partial = path.join(dbRoot, `${stamp}.partial`);
  fs.mkdirSync(partial, { recursive: true });

  const dumps = [
    ["roles.sql", ["--role-only"]],
    ["schema.sql", []],
    ["data.sql", ["--data-only", "--use-copy"]],
  ];
  for (const [name, flags] of dumps) {
    const file = path.join(partial, name);
    console.log(`db: dumping ${name}`);
    // One command string through the shell: on Windows the CLI is an npm shim
    // that cannot be spawned directly.
    const command = ["supabase", "db", "dump", "--linked", ...flags, "-f", `"${file}"`].join(" ");
    // The connection to the database drops now and then mid-dump; a second
    // try usually goes through, so only a dump that keeps failing is fatal.
    let size = 0;
    for (let attempt = 1; ; attempt += 1) {
      const result = spawnSync(command, { cwd: root, shell: true, stdio: "inherit" });
      size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (result.status === 0 && size > 0) break;
      if (attempt === 3) {
        throw new Error(`supabase db dump failed for ${name}; left ${partial} for inspection`);
      }
      console.log(`db: ${name} failed, retrying (${attempt + 1} of 3)`);
    }
    console.log(`db: ${name} ${megabytes(size)}`);
  }

  const final = path.join(dbRoot, stamp);
  fs.renameSync(partial, final);
  console.log(`db: saved ${final}`);

  const complete = fs
    .readdirSync(dbRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(".partial"))
    .map((entry) => entry.name)
    .sort();
  for (const old of complete.slice(0, Math.max(0, complete.length - keep))) {
    fs.rmSync(path.join(dbRoot, old), { recursive: true });
    console.log(`db: pruned ${old}`);
  }
}

/** Every file in a bucket, walking folders; list() returns one level a page at a time. */
async function listFiles(supabase, bucket, prefix = "") {
  const files = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing ${bucket}/${prefix}: ${error.message}`);
    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      // A folder is an entry with no id.
      if (item.id === null) files.push(...(await listFiles(supabase, bucket, itemPath)));
      else files.push({ path: itemPath, size: item.metadata?.size, updatedAt: item.updated_at });
    }
    if (data.length < pageSize) return files;
  }
}

async function backupStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`listing buckets: ${error.message}`);

  let failed = 0;
  for (const { name: bucket } of buckets) {
    const bucketDir = path.join(dest, "storage", bucket);
    const files = await listFiles(supabase, bucket);
    const stale = files.filter((file) => {
      const local = path.join(bucketDir, file.path);
      if (!fs.existsSync(local)) return true;
      const stat = fs.statSync(local);
      return stat.size !== file.size || stat.mtime < new Date(file.updatedAt);
    });

    let bytes = 0;
    const queue = [...stale];
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const { data, error: downloadError } = await supabase.storage
          .from(bucket)
          .download(file.path);
        if (downloadError) {
          failed += 1;
          console.error(`storage: FAILED ${bucket}/${file.path}: ${downloadError.message}`);
          continue;
        }
        const local = path.join(bucketDir, file.path);
        fs.mkdirSync(path.dirname(local), { recursive: true });
        // Write beside the target and rename, so an interrupted download never
        // leaves a truncated file that a later run would take for complete.
        fs.writeFileSync(`${local}.partial`, Buffer.from(await data.arrayBuffer()));
        fs.renameSync(`${local}.partial`, local);
        bytes += data.size;
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    console.log(
      `storage: ${bucket}: ${files.length} files, ${stale.length} new or changed (${megabytes(bytes)})`,
    );
  }
  if (failed) throw new Error(`${failed} file(s) could not be downloaded`);
}

try {
  console.log(`Backing up to ${dest}`);
  if (only !== "storage") backupDatabase();
  if (only !== "db") await backupStorage();
  console.log("Backup complete.");
} catch (error) {
  console.error(`Backup FAILED: ${error.message}`);
  process.exit(1);
}
