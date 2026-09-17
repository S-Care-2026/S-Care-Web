// Shared by the migrate and seed scripts: loads backend/.env and opens a
// direct (unpooled) Postgres connection.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(backendDir, ".env"), quiet: true });

export const MIGRATIONS_DIR = path.resolve(backendDir, "../database/postgres");
export const SEEDS_DIR = path.join(MIGRATIONS_DIR, "seeds");

export async function connect() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in backend/.env");
  }

  const { hostname, pathname } = new URL(url);
  if (hostname.includes("-pooler")) {
    throw new Error(
      "This is a pooled Neon URL. Schema changes need the direct connection: set DATABASE_URL_UNPOOLED."
    );
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();
  console.log(`Connected to ${hostname}${pathname}`);
  return client;
}

// Postgres reports a character offset; turn it into a line number for the SQL file.
export function describeSqlError(err, sql) {
  if (!err.position) return err.message;
  const line = sql.slice(0, Number(err.position)).split("\n").length;
  return `${err.message} (line ${line})`;
}

// Git on Windows may check files out with CRLF; hash and run them the same everywhere.
export function normalizeSql(text) {
  return text.replace(/\r\n/g, "\n");
}
