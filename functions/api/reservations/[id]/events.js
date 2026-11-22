import { currentStaff, json } from "../../../_lib/security.js";

export async function onRequestGet({ request, env, params }) {
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (user.must_change_password) return json({ error: "Change your temporary password before viewing reservation activity." }, 403);
  if (!["owner", "manager"].includes(user.role)) return json({ error: "You do not have permission to view reservation activity." }, 403);
  const reservation = await env.DB.prepare("SELECT id FROM reservations WHERE id = ?").bind(params.id).first();
  if (!reservation) return json({ error: "Reservation not found." }, 404);
  const result = await env.DB.prepare("SELECT e.event_type, e.previous_status, e.new_status, e.created_at, COALESCE(s.full_name, 'Former or unavailable staff account') AS actor_name, COALESCE(s.role, 'unavailable') AS actor_role FROM reservation_events e LEFT JOIN staff_users s ON s.id = e.actor_user_id WHERE e.reservation_id = ? ORDER BY e.created_at DESC").bind(params.id).all();
  return json({ events: result.results || [] });
}
