import { changePassword, login, publicUser, register } from "../auth/auth.js";
import { HttpError, requireText } from "./validate.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/login  { email, password }
export async function postLogin(req, res) {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    throw new HttpError(400, "Enter your email and password.");
  }
  const result = await login(email.trim(), password);
  if (!result) throw new HttpError(401, "That email and password don’t match an account.");
  res.json({ success: true, data: { token: result.token, user: publicUser(result.user) } });
}

// POST /api/auth/register  { fullName, email, password, homeName? }
export async function postRegister(req, res) {
  const body = req.body ?? {};
  const fullName = requireText(body.fullName, "your name", 120);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
  const homeName = typeof body.homeName === "string" && body.homeName.trim() ? requireText(body.homeName, "a home name", 120) : `${fullName}’s home`;

  const result = await register({ email, password: body.password, fullName, homeName });
  res.status(201).json({ success: true, data: { token: result.token, user: publicUser(result.user) } });
}

// POST /api/auth/password  { currentPassword, newPassword } → { token } for this session
export async function postChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {};
  const token = await changePassword(req.user, currentPassword, newPassword);
  res.json({ success: true, data: { token } });
}

// GET /api/auth/me
export function getMe(req, res) {
  res.json({ success: true, data: publicUser(req.user) });
}
