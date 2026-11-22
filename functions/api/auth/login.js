import { assertSameOrigin, cookieHeader, createSession, json, verifyPassword } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) return json({ error: "Enter your email and password." }, 400);

  const user = await env.DB.prepare("SELECT * FROM staff_users WHERE email = ? COLLATE NOCASE").bind(email).first();
  const now = new Date().toISOString();
  if (!user || !user.is_active || (user.locked_until && user.locked_until > now)) {
    return json({ error: "Email or password is incorrect, or the account is temporarily unavailable." }, 401);
  }
  const matches = await verifyPassword(password, user.password_hash);
  if (!matches) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await env.DB.prepare("UPDATE staff_users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .bind(attempts >= 5 ? 0 : attempts, lockUntil, now, user.id).run();
    return json({ error: "Email or password is incorrect, or the account is temporarily unavailable." }, 401);
  }

  await env.DB.prepare("UPDATE staff_users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, user.id).run();
  const token = await createSession(user.id, request, env);
  return json({
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, must_change_password: !!user.must_change_password }
  }, 200, { "set-cookie": cookieHeader(token) });
}
