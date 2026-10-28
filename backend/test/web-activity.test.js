import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import pg from "pg";
import { readActivitySummary, recordHeartbeat } from "../src/services/webActivity.js";

// Explicitly opt into an isolated database; never load backend/.env in tests.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database.");
const schema = `activity_test_${randomUUID().replaceAll("-", "")}`;
const setup = new pg.Client({ connectionString: databaseUrl });
let db, server, baseUrl, closePostgres;
const ids = Array.from({ length: 4 }, () => randomUUID());
const secret = "web-activity-integration-test-only";
const token = (i) => jwt.sign({ sub: ids[i] }, secret, { expiresIn: "1h" });

before(async () => {
  await setup.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = secret;
  db = new pg.Pool({ connectionString: url.toString() });
  await db.query(`
    CREATE TABLE users (
      id uuid PRIMARY KEY, email text, full_name text, is_active boolean,
      is_platform_admin boolean, password_changed_at timestamptz
    );
    CREATE TABLE facilities (id uuid PRIMARY KEY, name text, kind text);
    CREATE TABLE facility_members (user_id uuid, facility_id uuid, role text, created_at timestamptz DEFAULT now());
  `);
  await db.query(await readFile(new URL("../../database/postgres/003_web_activity.sql", import.meta.url), "utf8"));
  const facilityId = randomUUID();
  await db.query("INSERT INTO facilities VALUES ($1, 'Demo', 'private_home')", [facilityId]);
  for (const [i, id] of ids.entries()) {
    await db.query("INSERT INTO users VALUES ($1, $2, 'Tester', $3, $4, NULL)", [id, `test${i}@example.org`, i !== 3, i === 0]);
    await db.query("INSERT INTO facility_members (user_id, facility_id, role) VALUES ($1, $2, $3)", [id, facilityId, i === 2 ? "caregiver" : "admin"]);
  }
  const { requireAuth, requirePlatformAdmin } = await import("../src/auth/auth.js");
  const { getActivitySummary, postHeartbeat } = await import("../src/controllers/activityController.js");
  ({ closePostgres } = await import("../src/db/postgres.js"));
  const app = express();
  app.use(express.json(), requireAuth);
  app.post("/heartbeat", postHeartbeat);
  app.get("/summary", requirePlatformAdmin, getActivitySummary);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => { await db.query("TRUNCATE web_activity"); });
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (closePostgres) await closePostgres();
  if (db) await db.end();
  await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await setup.end();
});

function request(path, index, body) {
  return fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(index === undefined ? {} : { Authorization: `Bearer ${token(index)}` }),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("summary requires authentication and platform permission, not a facility admin role", async () => {
  assert.equal((await request("/summary")).status, 401);
  assert.equal((await request("/summary", 1)).status, 403);
  assert.equal((await request("/summary", 2)).status, 403);
  assert.equal((await request("/summary", 3)).status, 401);
  const response = await request("/summary", 0);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { data } = await response.json();
  assert.equal(data.totalUsers, 4);
  assert.equal(data.enabledUsers, 3);
  assert.equal(data.onlineUsers, 0);
  assert.equal(data.totalActiveSeconds, 0);
  assert.equal(data.trackingStartedAt, null);
});

test("heartbeat validates duration and uses the token's identity", async () => {
  assert.equal((await request("/heartbeat", undefined, { activeMs: 0 })).status, 401);
  for (const activeMs of [-1, 60001, 0.5, "30000", null]) {
    assert.equal((await request("/heartbeat", 2, { activeMs })).status, 400);
  }
  assert.equal((await request("/heartbeat", 2, {})).status, 400);
  assert.equal((await request("/heartbeat", 2, { activeMs: 30000, userId: ids[0] })).status, 200);
  const { rows } = await db.query("SELECT * FROM web_activity");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, ids[2]);
  assert.equal(Number(rows[0].active_ms), 0); // first contact has no preceding interval
});

test("concurrent tabs cannot multiply the same account's elapsed time", async () => {
  await recordHeartbeat(db, ids[0], 0);
  await db.query(`UPDATE web_activity SET
    first_seen_at = statement_timestamp() - interval '30 seconds',
    last_seen_at = statement_timestamp() - interval '30 seconds'`);
  await Promise.all(Array.from({ length: 12 }, () => recordHeartbeat(db, ids[0], 30000)));
  const { rows } = await db.query(`SELECT active_ms,
    extract(epoch FROM (last_seen_at - first_seen_at)) * 1000 AS observed_ms FROM web_activity`);
  const duration = Number(rows[0].active_ms);
  assert.ok(duration >= 30000 && duration <= Number(rows[0].observed_ms), `unexpected duration: ${duration}`);
  assert.equal((await readActivitySummary(db)).onlineUsers, 1);
});

test("foreground time is bounded by reported time and offline gaps do not accrue", async () => {
  await recordHeartbeat(db, ids[0], 0);
  await db.query("UPDATE web_activity SET last_seen_at = clock_timestamp() - interval '60 seconds'");
  await recordHeartbeat(db, ids[0], 5000);
  assert.equal((await readActivitySummary(db)).totalActiveSeconds, 5);
  await db.query("UPDATE web_activity SET last_seen_at = clock_timestamp() - interval '2 hours'");
  assert.equal((await readActivitySummary(db)).onlineUsers, 0);
  await recordHeartbeat(db, ids[0], 60000);
  assert.equal((await readActivitySummary(db)).totalActiveSeconds, 5);
  assert.equal((await readActivitySummary(db)).onlineUsers, 1);
});

test("summary distinguishes tracked, recent, online and disabled users", async () => {
  await db.query(`INSERT INTO web_activity (user_id, last_seen_at, active_ms) VALUES
    ($1, now() - interval '91 seconds', 10000),
    ($2, now() - interval '25 hours', 20000),
    ($3, now(), 30000),
    ($4, now(), 40000)`, ids);
  const summary = await readActivitySummary(db);
  assert.equal(summary.trackedUsers, 4);
  assert.equal(summary.activeUsers24h, 3);
  assert.equal(summary.onlineUsers, 1);
  assert.equal(summary.totalActiveSeconds, 100);
  assert.equal(summary.averageActiveSecondsPerTrackedUser, 25);
});
