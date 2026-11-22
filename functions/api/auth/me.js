import { currentStaff, json } from "../../_lib/security.js";

export async function onRequestGet({ request, env }) {
  const user = await currentStaff(request, env);
  if (!user) return json({ user: null }, 200);
  return json({ user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, must_change_password: !!user.must_change_password } });
}
