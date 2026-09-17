// Accounts: sign-up, login with email + password (bcrypt hashes in users.password_hash),
// password changes, and stateless JWT access tokens.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { isProduction } from "../env.js";
import { query, transaction } from "../db/postgres.js";

const TOKEN_TTL = "12h";
const USER_CACHE_MS = 30_000;
const BCRYPT_COST = 10;
const PLACEHOLDER_SECRETS = new Set(["", "your_jwt_secret_here", "change-me"]);
export const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

let secret = process.env.JWT_SECRET ?? "";
if (PLACEHOLDER_SECRETS.has(secret)) {
  if (isProduction) throw new Error("JWT_SECRET must be set to a long random value in production");
  secret = randomBytes(32).toString("hex");
  console.warn("[auth] JWT_SECRET not set — using a random secret; sessions end when the server restarts");
}

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are real.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

const userCache = new Map(); // user id -> { value, expires }

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function loadUser(userId) {
  const hit = userCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.is_active, u.password_changed_at,
            m.facility_id, m.role, f.name AS facility_name, f.kind AS facility_kind
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
      facilityKind: row.facility_kind,
      passwordChangedAt: row.password_changed_at ? row.password_changed_at.getTime() : null,
      patientIds,
    };
  }
  userCache.set(userId, { value, expires: Date.now() + USER_CACHE_MS });
  return value;
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_TTL });
}

export function checkPasswordPolicy(password, email) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new AuthError(400, `Use a password of at least ${PASSWORD_MIN} characters.`);
  }
  if (password.length > PASSWORD_MAX) throw new AuthError(400, `Use a password of at most ${PASSWORD_MAX} characters.`);
  if (email && password.toLowerCase() === String(email).toLowerCase()) {
    throw new AuthError(400, "Don’t use your email address as the password.");
  }
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
  return { token: issueToken(user.id), user };
}

// Self sign-up: the new user gets their own home (a facility of kind private_home) as its admin,
// and can pair bands to it. Care-home staff are added by their facility instead.
export async function register({ email, password, fullName, homeName }) {
  checkPasswordPolicy(password, email);
  const hash = await bcrypt.hash(password, BCRYPT_COST);

  const userId = await transaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, password_changed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, hash, fullName]
    );
    if (!rows[0]) throw new AuthError(409, "An account with this email already exists. Sign in instead.");

    const facility = await db.query("INSERT INTO facilities (name, kind) VALUES ($1, 'private_home') RETURNING id", [homeName]);
    await db.query("INSERT INTO facility_members (facility_id, user_id, role) VALUES ($1, $2, 'admin')", [facility.rows[0].id, rows[0].id]);
    return rows[0].id;
  });

  const user = await loadUser(userId);
  return { token: issueToken(userId), user };
}

// Returns a fresh token for this session; tokens issued earlier stop working.
export async function changePassword(user, currentPassword, newPassword) {
  checkPasswordPolicy(newPassword, user.email);
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  const ok = await bcrypt.compare(String(currentPassword ?? ""), rows[0]?.password_hash ?? DUMMY_HASH);
  if (!ok) throw new AuthError(400, "Your current password isn’t right.");
  if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
    throw new AuthError(400, "Choose a password different from your current one.");
  }

  await query("UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1", [
    user.id,
    await bcrypt.hash(newPassword, BCRYPT_COST),
  ]);
  userCache.delete(user.id);
  return issueToken(user.id);
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
      // iat has whole-second precision, so allow the second in which the password changed.
      if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt - 999) {
        return res.status(401).json({ success: false, error: "Your password was changed — sign in again" });
      }
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

// Small in-memory limiter (single backend instance). `keyOf` picks what is counted: IP, user id, …
export function rateLimit({ limit, windowMs, message, keyOf = (req) => req.ip ?? "unknown" }) {
  const attempts = new Map();
  return (req, res, next) => {
    const key = keyOf(req);
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return res.status(429).json({ success: false, error: message });
    recent.push(now);
    attempts.set(key, recent);
    next();
  };
}

export const loginRateLimit = rateLimit({
  limit: 10,
  windowMs: 5 * 60_000,
  message: "Too many sign-in attempts. Wait a few minutes and try again.",
});

export const registerRateLimit = rateLimit({
  limit: 10,
  windowMs: 60 * 60_000,
  message: "Too many accounts created from this network. Try again later.",
});
