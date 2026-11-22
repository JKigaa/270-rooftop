import { assertSameOrigin, audit, cleanText, currentStaff, hashPassword, json, randomId, validEmail } from "../../_lib/security.js";

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20) + "aA7!";
}

export async function onRequestGet({ request, env }) {
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (user.must_change_password) return json({ error: "Change your temporary password before managing staff." }, 403);
  if (!["owner","manager"].includes(user.role)) return json({ error: "You do not have permission to manage staff accounts." }, 403);
  const query = user.role === "owner"
    ? env.DB.prepare("SELECT id, email, full_name, role, manager_id, is_active, last_login_at, created_at FROM staff_users WHERE role = 'manager' AND manager_id = ? ORDER BY full_name").bind(user.id)
    : env.DB.prepare("SELECT id, email, full_name, role, manager_id, is_active, last_login_at, created_at FROM staff_users WHERE manager_id = ? ORDER BY full_name").bind(user.id);
  const result = await query.all();
  return json({ staff: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const actor = await currentStaff(request, env);
  if (!actor) return json({ error: "Please sign in to continue." }, 401);
  if (actor.must_change_password) return json({ error: "Change your temporary password before managing staff." }, 403);
  if (!["owner","manager"].includes(actor.role)) return json({ error: "You do not have permission to create staff accounts." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const role = actor.role === "owner" ? "manager" : "staff";
  const name = cleanText(body.full_name, 100);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (name.length < 2 || !validEmail(email)) return json({ error: "Enter a name and valid work email." }, 400);
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const id = randomId();
  try {
    await env.DB.prepare("INSERT INTO staff_users (id,email,full_name,role,manager_id,password_hash,must_change_password) VALUES (?,?,?,?,?,?,1)")
      .bind(id, email, name, role, actor.id, hash).run();
  } catch {
    return json({ error: "That email may already belong to a staff account." }, 409);
  }
  await audit(env, actor.id, "staff_account_created", "staff_user", id, { role, email });
  return json({ ok: true, staff: { id, email, full_name: name, role }, temporary_password: password }, 201);
}
