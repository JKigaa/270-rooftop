import { assertSameOrigin, audit, currentStaff, json } from "../../_lib/security.js";

export async function onRequestPatch({ request, env, params }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const actor = await currentStaff(request, env);
  if (!actor) return json({ error: "Please sign in to continue." }, 401);
  if (actor.must_change_password) return json({ error: "Change your temporary password before managing staff." }, 403);
  if (!["owner","manager"].includes(actor.role)) return json({ error: "You do not have permission to manage accounts." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (typeof body.is_active !== "boolean") return json({ error: "Choose whether this account should be active." }, 400);
  const target = await env.DB.prepare("SELECT id, role, manager_id, is_active FROM staff_users WHERE id = ?").bind(params.id).first();
  if (!target) return json({ error: "Staff account not found." }, 404);
  const permitted = actor.role === "owner"
    ? target.role === "manager" && target.manager_id === actor.id
    : target.role === "staff" && target.manager_id === actor.id;
  if (!permitted) return json({ error: "You can only manage accounts directly assigned to you." }, 403);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE staff_users SET is_active = ?, updated_at = ? WHERE id = ?").bind(body.is_active ? 1 : 0, now, target.id).run();
  if (!body.is_active) {
    await env.DB.prepare("UPDATE staff_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(now, target.id).run();
    if (target.role === "manager") {
      await env.DB.prepare(`UPDATE staff_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id IN
        (SELECT id FROM staff_users WHERE manager_id = ?)`).bind(now, target.id).run();
    }
  }
  await audit(env, actor.id, body.is_active ? "staff_account_activated" : "staff_account_deactivated", "staff_user", target.id);
  return json({ ok: true, message: body.is_active ? "Account activated." : "Account deactivated." });
}
