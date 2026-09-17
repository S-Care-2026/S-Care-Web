// InfluxDB Cloud Serverless. Writes are batched; queries use SQL.
// Optional: without INFLUX_HOST/INFLUX_TOKEN nothing is written and history is empty.
import { InfluxDBClient, Point } from "@influxdata/influxdb3-client";

const FLUSH_EVERY_MS = 1_000;
const FLUSH_AT_POINTS = 5_000;
const MAX_BUFFERED_POINTS = 50_000;

let client = null;
let buffer = [];
let flushing = null;
let timer = null;
let lastError = null;

export { Point };

export function hasInflux() {
  return Boolean(process.env.INFLUX_HOST && process.env.INFLUX_TOKEN);
}

function rawDatabase() {
  return process.env.INFLUX_DATABASE || "scare_raw";
}

function getClient() {
  if (!hasInflux()) return null;
  if (!client) {
    client = new InfluxDBClient({
      host: process.env.INFLUX_HOST,
      token: process.env.INFLUX_TOKEN,
      database: rawDatabase(),
    });
  }
  return client;
}

export function writePoints(points) {
  if (!hasInflux() || points.length === 0) return;
  buffer.push(...points);
  if (buffer.length > MAX_BUFFERED_POINTS) {
    // InfluxDB unreachable for a long time: drop the oldest rather than run out of memory.
    buffer = buffer.slice(buffer.length - MAX_BUFFERED_POINTS);
  }
  if (buffer.length >= FLUSH_AT_POINTS) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), FLUSH_EVERY_MS);
}

export async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) return flushing;
  if (buffer.length === 0 || !getClient()) return;

  const batch = buffer;
  buffer = [];
  flushing = getClient()
    .write(batch, rawDatabase())
    .then(() => {
      lastError = null;
    })
    .catch((err) => {
      lastError = err.message;
      console.error(`[influx] write of ${batch.length} points failed: ${err.message}`);
      buffer = batch.concat(buffer); // retry with the next flush
      if (!timer) timer = setTimeout(() => void flush(), 10_000);
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

// Returns plain rows. A table that has never been written to yields [] instead of an error.
export async function queryRows(sql, params = {}) {
  const c = getClient();
  if (!c) return [];
  const rows = [];
  try {
    for await (const row of c.query(sql, rawDatabase(), { type: "sql", params })) rows.push(row);
  } catch (err) {
    if (/not found|does not exist/i.test(err.message)) return [];
    throw err;
  }
  return rows;
}

// Influx returns int64 columns as BigInt; timestamps cast to BIGINT are nanoseconds.
export function toNumber(value) {
  if (typeof value === "bigint") return Number(value);
  return value == null ? null : Number(value);
}

export function nsToMs(value) {
  if (typeof value === "bigint") return Number(value / 1_000_000n);
  return Math.round(Number(value) / 1_000_000);
}

export function influxStatus() {
  if (!hasInflux()) return "disabled";
  return lastError ? `error: ${lastError}` : "ok";
}

export async function closeInflux() {
  await flush().catch(() => {});
  if (client) await client.close().catch(() => {});
}
