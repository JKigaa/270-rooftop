import { assertSameOrigin, clearSessionCookie, getCookie, hashToken, json } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const token = getCookie(request, "__Host-270_staff_session");
  if (token) {
    const tokenHash = await hashToken(token);
    await env.DB.prepare("UPDATE staff_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), tokenHash).run();
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}
