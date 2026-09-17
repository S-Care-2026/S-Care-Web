import { login, publicUser } from "../auth/auth.js";
import { HttpError } from "./validate.js";

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

// GET /api/auth/me
export function getMe(req, res) {
  res.json({ success: true, data: publicUser(req.user) });
}
