// Loads development demo data from database/postgres/seeds/*.sql.
//
//   npm run db:seed
//
// Seeds are not migrations: they are never recorded in schema_migrations and must
// never run against real patient data. Every insert uses fixed ids with
// ON CONFLICT (primary key) DO NOTHING, so running this again is safe and changes nothing.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { connect, describeSqlError, MIGRATIONS_DIR, normalizeSql, SEEDS_DIR } from "./db-connection.js";

const MIGRATION_PATTERN = /^\d{3,}_[a-z0-9_]+\.sql$/;

async function checkMigrated(client) {
  const expected = (await readdir(MIGRATIONS_DIR)).filter((name) => MIGRATION_PATTERN.test(name)).length;
  const { rows } = await client.query("SELECT to_regclass('schema_migrations') AS t");
  const applied = rows[0].t
    ? Number((await client.query("SELECT count(*) FROM schema_migrations")).rows[0].count)
    : 0;

  if (applied < expected) {
    throw new Error(`${expected - applied} migration(s) not applied yet — run \`npm run migrate\` first`);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production");
  }

  const files = (await readdir(SEEDS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const client = await connect();

  try {
    await checkMigrated(client);

    for (const filename of files) {
      const sql = normalizeSql(await readFile(path.join(SEEDS_DIR, filename), "utf8"));
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`${filename} failed: ${describeSqlError(err, sql)}`);
      }
      console.log(`  seeded  ${filename}`);
    }
    console.log("Done. Demo logins: admin@scare.demo / admin1234, caregiver@scare.demo / demo1234");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`seed: ${err.message}`);
  process.exitCode = 1;
});
