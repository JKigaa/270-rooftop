const SESSION_COOKIE = "__Host-270_staff_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PBKDF2_ITERATIONS = 310000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

export function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const item = part.trim();
    const index = item.indexOf("=");
    if (index > -1 && item.slice(0, index) === name) { try { return decodeURIComponent(item.slice(index + 1)); } catch { return null; } }
  }
  return null;
}

export function cookieHeader(value, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    const url = new URL(request.url);
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

export function randomId() {
  return crypto.randomUUID();
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [algorithm, iterationsText, saltText, hashText] = stored.split("$");
    if (algorithm !== "pbkdf2-sha256") return false;
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltText), iterations }, key, 256);
    const actual = new Uint8Array(bits);
    const expected = fromBase64(hashText);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64(digest);
}

export async function currentStaff(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.role, u.manager_id, u.must_change_password
     FROM staff_sessions s JOIN staff_users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.is_active = 1
       AND (u.role = 'owner' OR EXISTS (
         SELECT 1 FROM staff_users manager
         WHERE manager.id = u.manager_id AND manager.is_active = 1
       ))`
  ).bind(tokenHash, now).first();
  return row || null;
}

export async function createSession(userId, request, env) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64(tokenBytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const tokenHash = await hashToken(token);
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO staff_sessions (id, user_id, token_hash, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).bind(randomId(), userId, tokenHash, expires, request.headers.get("User-Agent") || null).run();
  return token;
}

export async function requireStaff(request, env) {
  const user = await currentStaff(request, env);
  if (!user) return { response: json({ error: "Please sign in to continue." }, 401) };
  return { user };
}

export function validPassword(password) {
  return typeof password === "string" && password.length >= 12 && password.length <= 128;
}

export function validEmail(email) {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanText(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function audit(env, actorId, action, entityType, entityId, details = {}) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(randomId(), actorId || null, action, entityType, entityId || null, JSON.stringify(details)).run();
}

export function validISODate(value) {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
