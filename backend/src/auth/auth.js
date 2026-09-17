// Login with email + password (bcrypt hashes in users.password_hash) and stateless JWT access tokens.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { isProduction } from "../env.js";
import { query } from "../db/postgres.js";

const TOKEN_TTL = "12h";
const USER_CACHE_MS = 30_000;
const PLACEHOLDER_SECRETS = new Set(["", "your_jwt_secret_here", "change-me"]);

let secret = process.env.JWT_SECRET ?? "";
if (PLACEHOLDER_SECRETS.has(secret)) {
  if (isProduction) throw new Error("JWT_SECRET must be set to a long random value in production");
  secret = randomBytes(32).toString("hex");
  console.warn("[auth] JWT_SECRET not set — using a random secret; sessions end when the server restarts");
}

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are real.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const userCache = new Map(); // user id -> { value, expires }

export async function loadUser(userId) {
  const hit = userCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.is_active, u.is_platform_admin,
            m.facility_id, m.role, f.name AS facility_name
     FROM users u
     LEFT JOIN LATERAL (
       SELECT facility_id, role FROM facility_members WHERE user_id = u.id ORDER BY created_at LIMIT 1
     ) m ON true
     LEFT JOIN facilities f ON f.id = m.facility_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  let value = null;
  if (row && row.is_active && row.facility_id) {
    const patientIds =
      row.role === "family"
        ? (await query("SELECT patient_id FROM patient_access WHERE user_id = $1", [userId])).rows.map((r) => r.patient_id)
        : null;
    value = {
      id: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role,
      facilityId: row.facility_id,
      facilityName: row.facility_name,
      patientIds,
    };
  }
  userCache.set(userId, { value, expires: Date.now() + USER_CACHE_MS });
  return value;
}

// Returns { token, user } or null for bad credentials, inactive users and users without a facility.
export async function login(email, password) {
  const { rows } = await query("SELECT id, password_hash, is_active FROM users WHERE email = $1", [email]);
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.password_hash || !ok || !row.is_active) return null;

  userCache.delete(row.id);
  const user = await loadUser(row.id);
  if (!user) return null;

  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [row.id]);
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn: TOKEN_TTL });
  return { token, user };
}

// The shape the dashboard stores as its signed-in user.
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    zone: user.facilityName,
    facilityId: user.facilityId,
  };
}

export function requireAuth(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: "Sign in required" });

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ success: false, error: "Session expired — sign in again" });
  }

  loadUser(payload.sub)
    .then((user) => {
      if (!user) return res.status(401).json({ success: false, error: "Account disabled or not linked to a facility" });
      req.user = user;
      next();
    })
    .catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: `Only ${roles.join(" or ")} accounts can do this` });
    }
    next();
  };
}

// Family members only see the patients they were given access to.
export function canSeePatient(user, patientId) {
  return user.role !== "family" || user.patientIds.includes(patientId);
}

// Small in-memory limiter for the login endpoint: 10 attempts per IP per 5 minutes.
const attempts = new Map();
export function loginRateLimit(req, res, next) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < 5 * 60_000);
  if (recent.length >= 10) {
    return res.status(429).json({ success: false, error: "Too many sign-in attempts. Wait a few minutes and try again." });
  }
  recent.push(now);
  attempts.set(key, recent);
  next();
}
