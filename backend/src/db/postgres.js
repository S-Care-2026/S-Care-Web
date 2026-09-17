// PostgreSQL (Neon). DATABASE_URL is the pooled connection string.
import pg from "pg";

let pool = null;

export function hasPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    pool.on("error", (err) => console.error(`[postgres] idle client error: ${err.message}`));
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

// Runs fn(client) inside BEGIN/COMMIT; rolls back and rethrows on error.
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function postgresStatus() {
  if (!hasPostgres()) return "disabled";
  try {
    await query("SELECT 1");
    return "connected";
  } catch (err) {
    return `error: ${err.message}`;
  }
}

export async function closePostgres() {
  if (pool) await pool.end().catch(() => {});
}
