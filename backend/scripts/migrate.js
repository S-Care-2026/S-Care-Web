// Applies database/postgres/NNN_name.sql files in order, each exactly once.
//
//   npm run migrate           apply pending migrations
//   npm run migrate:status    list applied and pending migrations
//
// Each file runs in its own transaction together with its schema_migrations row,
// so a failing migration leaves nothing behind. A file whose first line is
// `-- migrate:no-transaction` runs without one (needed for CREATE INDEX CONCURRENTLY).
// Applied files must never be edited — add a new numbered file instead.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { connect, describeSqlError, MIGRATIONS_DIR, normalizeSql } from "./db-connection.js";

const FILE_PATTERN = /^(\d{3,})_[a-z0-9_]+\.sql$/;
const NO_TRANSACTION_MARKER = "-- migrate:no-transaction";
// Arbitrary key for pg_advisory_lock, so two migrate runs can't overlap.
const LOCK_KEY = 7_231_001;

async function loadMigrationFiles() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => FILE_PATTERN.test(name)).sort();

  const migrations = [];
  const seen = new Map();
  for (const filename of files) {
    const version = filename.match(FILE_PATTERN)[1];
    if (seen.has(version)) {
      throw new Error(`Two migrations share version ${version}: ${seen.get(version)} and ${filename}`);
    }
    seen.set(version, filename);

    const sql = normalizeSql(await readFile(path.join(MIGRATIONS_DIR, filename), "utf8"));
    const checksum = createHash("sha256").update(sql).digest("hex");
    migrations.push({ version, filename, sql, checksum });
  }
  return migrations;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      filename    text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied(client) {
  const { rows } = await client.query(
    "SELECT version, filename, checksum, applied_at FROM schema_migrations ORDER BY version"
  );
  return new Map(rows.map((row) => [row.version, row]));
}

function checkAppliedUnchanged(migrations, applied) {
  for (const migration of migrations) {
    const row = applied.get(migration.version);
    if (row && row.checksum !== migration.checksum) {
      throw new Error(
        `${migration.filename} was changed after it was applied (on ${row.applied_at.toISOString()}). ` +
          "Revert the edit and put the change in a new migration file."
      );
    }
  }
  for (const row of applied.values()) {
    if (!migrations.some((m) => m.version === row.version)) {
      console.warn(`warning: ${row.filename} is applied but its file is missing`);
    }
  }
}

async function applyMigration(client, migration) {
  const useTransaction = !migration.sql.startsWith(NO_TRANSACTION_MARKER);
  const started = Date.now();

  try {
    if (useTransaction) await client.query("BEGIN");
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)",
      [migration.version, migration.filename, migration.checksum]
    );
    if (useTransaction) await client.query("COMMIT");
  } catch (err) {
    if (useTransaction) await client.query("ROLLBACK").catch(() => {});
    throw new Error(`${migration.filename} failed: ${describeSqlError(err, migration.sql)}`);
  }

  console.log(`  applied  ${migration.filename}  (${Date.now() - started} ms)`);
}

async function main() {
  const command = process.argv[2] ?? "up";
  if (command !== "up" && command !== "status") {
    throw new Error(`Unknown command "${command}". Use: up | status`);
  }

  const migrations = await loadMigrationFiles();
  const client = await connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureMigrationsTable(client);
    const applied = await loadApplied(client);
    checkAppliedUnchanged(migrations, applied);

    const pending = migrations.filter((m) => !applied.has(m.version));

    if (command === "status") {
      for (const m of migrations) {
        const row = applied.get(m.version);
        console.log(`  ${row ? `applied ${row.applied_at.toISOString()}` : "pending                         "}  ${m.filename}`);
      }
      console.log(`${applied.size} applied, ${pending.length} pending`);
      return;
    }

    if (pending.length === 0) {
      console.log("Database is up to date.");
      return;
    }

    for (const migration of pending) {
      await applyMigration(client, migration);
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error(`migrate: ${err.message}`);
  process.exitCode = 1;
});
