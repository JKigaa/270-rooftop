import { assertSameOrigin, currentStaff, hashPassword, json, validPassword, verifyPassword, audit } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (!validPassword(body.current_password) || !validPassword(body.new_password)) {
    return json({ error: "Passwords must be between 12 and 128 characters." }, 400);
  }
  const row = await env.DB.prepare("SELECT password_hash FROM staff_users WHERE id = ?").bind(user.id).first();
  if (!await verifyPassword(body.current_password, row.password_hash)) return json({ error: "Current password is incorrect." }, 400);
  if (body.current_password === body.new_password) return json({ error: "Choose a different new password." }, 400);
  const hash = await hashPassword(body.new_password);
  await env.DB.prepare("UPDATE staff_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
    .bind(hash, new Date().toISOString(), user.id).run();
  await env.DB.prepare("UPDATE staff_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), user.id).run();
  await audit(env, user.id, "password_changed", "staff_user", user.id);
  return json({ ok: true, message: "Password changed. Please sign in again." }, 200, { "set-cookie": "__Host-270_staff_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
}
