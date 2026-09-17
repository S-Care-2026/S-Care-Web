// Redis (Upstash). Optional: without REDIS_URL the backend keeps latest readings in memory only.
// Upstash bills per command, so callers write sparingly (see services/latest.js).
import Redis from "ioredis";

let client = null;
let lastErrorLog = 0;

export function redis() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    const url = new URL(process.env.REDIS_URL);
    // Upstash only accepts TLS. A redis:// URL copied without the extra "s" would never connect.
    const tls = url.protocol === "rediss:" || url.hostname.endsWith(".upstash.io");
    if (tls && url.protocol === "redis:") console.warn("[redis] REDIS_URL uses redis:// for Upstash — connecting with TLS anyway (use rediss://)");
    client = new Redis(process.env.REDIS_URL, {
      ...(tls ? { tls: { servername: url.hostname } } : {}),
      maxRetriesPerRequest: 2,
      connectTimeout: 10_000,
      // Upstash closes idle connections; reconnect quietly.
      retryStrategy: (times) => Math.min(times * 1000, 30_000),
    });
    client.on("error", (err) => {
      if (Date.now() - lastErrorLog > 60_000) {
        lastErrorLog = Date.now();
        console.error(`[redis] ${err.message}`);
      }
    });
  }
  return client;
}

export function redisStatus() {
  if (!process.env.REDIS_URL) return "disabled";
  return client?.status ?? "not started";
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => {});
}
