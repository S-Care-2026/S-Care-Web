import "./env.js";
import express from "express";
import cors from "cors";
import apiRouter from "./routes/api.js";
import { AuthError } from "./auth/auth.js";
import { HttpError } from "./controllers/validate.js";
import { closeInflux } from "./db/influx.js";
import { closePostgres, hasPostgres, query } from "./db/postgres.js";
import { closeRedis } from "./db/redis.js";
import { startSubscriber, stopSubscriber } from "./mqtt/subscriber.js";
import { warmLatest } from "./services/latest.js";
import { startPresence, stopPresence } from "./services/presence.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1); // Render's proxy: req.ip is the client, for the login rate limit
app.use(cors());
app.use(express.json({ limit: "100kb" }));

// Log changes and failures; the dashboard polls every few seconds, so successful reads stay quiet.
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    if (req.method !== "GET" || res.statusCode >= 400) {
      console.log(`[http] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - started} ms)`);
    }
  });
  next();
});

app.use("/api", apiRouter);

app.get("/", (req, res) => {
  res.json({ service: "S-Care Backend API", version: "1.0.0", health: "/api/health" });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Express 5 forwards errors thrown in async handlers here.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError || err instanceof AuthError) return res.status(err.status).json({ success: false, error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, error: "Request body is not valid JSON" });
  console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ success: false, error: "Something went wrong on the server. Try again." });
});

async function start() {
  if (hasPostgres()) {
    try {
      const { rows } = await query("SELECT device_uid FROM devices WHERE lifecycle <> 'retired'");
      await warmLatest(rows.map((r) => r.device_uid));
      await startPresence();
    } catch (err) {
      console.error(`[startup] database not ready: ${err.message}`);
    }
  } else {
    console.warn("[startup] DATABASE_URL is not set — readings won't be stored and the API needs a database");
  }
  startSubscriber();
}

const server = app.listen(PORT, () => {
  console.log(`🚀 S-Care Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/api/health`);
  void start();
});

// Render sends SIGTERM on redeploy: stop taking messages, flush pending writes, then exit.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopPresence();
  await stopSubscriber().catch((err) => console.error(err));
  await closeInflux();
  await closeRedis();
  server.close(() => {
    void closePostgres().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
