import { audit, hashPassword, json, randomId, validEmail, validPassword, cleanText } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const suppliedSecret = request.headers.get("X-Setup-Secret") || "";
  if (!env.BOOTSTRAP_SECRET || suppliedSecret.length < 24 || suppliedSecret !== env.BOOTSTRAP_SECRET) {
    return json({ error: "Setup authorization failed." }, 403);
  }
  const existing = await env.DB.prepare("SELECT id FROM staff_users WHERE role = 'owner' LIMIT 1").first();
  if (existing) return json({ error: "The owner account has already been created. Setup is closed." }, 409);

  const fullName = cleanText(body.full_name, 100);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body.password;
  if (fullName.length < 2 || !validEmail(email) || !validPassword(password)) {
    return json({ error: "Provide a name, valid email, and a password of at least 12 characters." }, 400);
  }
  const id = randomId();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.prepare(
      "INSERT INTO staff_users (id, email, full_name, role, manager_id, password_hash, must_change_password) VALUES (?, ?, ?, 'owner', NULL, ?, 0)"
    ).bind(id, email, fullName, passwordHash).run();
  } catch {
    return json({ error: "Could not create the owner account. Check whether the email is already in use." }, 409);
  }
  await audit(env, id, "owner_bootstrapped", "staff_user", id, { email });
  return json({ ok: true, message: "Owner account created. You can now sign in." }, 201);
}
