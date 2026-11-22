import { assertSameOrigin, audit, cleanText, currentStaff, json, randomId, validISODate } from "../../_lib/security.js";

export async function onRequestGet({ request, env }) {
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (user.must_change_password) return json({ error: "Change your temporary password before using reservations." }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const date = url.searchParams.get("date");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 250);
  const clauses = [];
  const values = [];
  if (status && ["pending","confirmed","declined","cancelled","completed","no_show"].includes(status)) {
    clauses.push("status = ?"); values.push(status);
  }
  if (date && validISODate(date)) { clauses.push("reservation_date = ?"); values.push(date); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const result = await env.DB.prepare(
    `SELECT r.id, r.reference_code, r.customer_name, r.customer_phone, r.customer_email, r.reservation_date,
      r.reservation_time, r.guest_count, r.occasion, r.special_requests, r.source, r.status, r.created_at, r.updated_at,
      COALESCE(updater.full_name, '') AS status_action_by, COALESCE(updater.role, '') AS status_action_role,
      COALESCE(creator.full_name, '') AS created_by_name
     FROM reservations r
     LEFT JOIN staff_users updater ON updater.id = r.updated_by_user_id
     LEFT JOIN staff_users creator ON creator.id = r.created_by_user_id
     ${where.replace(/\bstatus\b/g, "r.status").replace(/\breservation_date\b/g, "r.reservation_date")}
     ORDER BY r.reservation_date DESC, r.reservation_time DESC LIMIT ?`
  ).bind(...values, limit).all();
  return json({ reservations: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (user.must_change_password) return json({ error: "Change your temporary password before using reservations." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const name = cleanText(body.customer_name, 100);
  const phone = cleanText(body.customer_phone, 30);
  const email = cleanText(body.customer_email, 254).toLowerCase() || null;
  const date = cleanText(body.reservation_date, 10);
  const time = cleanText(body.reservation_time, 5);
  const guests = Number(body.guest_count);
  const source = ["website","whatsapp","phone","walk_in","staff","other"].includes(body.source) ? body.source : "staff";
  const occasion = cleanText(body.occasion, 80) || null;
  const notes = cleanText(body.special_requests, 1000) || null;
  if (name.length < 2 || phone.length < 7 || !validISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(guests) || guests < 1 || guests > 40) {
    return json({ error: "Check the guest name, phone, date, time and guest count (1–40)." }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address or leave it blank." }, 400);
  const id = randomId();
  const ref = "270-" + new Date().toISOString().slice(2,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,6).toUpperCase();
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO reservations
        (id, reference_code, customer_name, customer_phone, customer_email, reservation_date, reservation_time,
         guest_count, occasion, special_requests, source, status, created_by_user_id, updated_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .bind(id, ref, name, phone, email, date, time, guests, occasion, notes, source, user.id, user.id),
      env.DB.prepare(`INSERT INTO reservation_events
        (id, reservation_id, actor_user_id, event_type, new_status, details_json)
        VALUES (?, ?, ?, 'reservation_created', 'pending', ?)`)
        .bind(randomId(), id, user.id, JSON.stringify({ source }))
    ]);
  } catch {
    return json({ error: "The reservation could not be saved. Please try again." }, 500);
  }
  await audit(env, user.id, "reservation_created", "reservation", id, { reference_code: ref, source });
  return json({ ok: true, reservation: { id, reference_code: ref, customer_name: name, customer_phone: phone, customer_email: email, reservation_date: date, reservation_time: time, guest_count: guests, source, status: "pending" } }, 201);
}
