import { assertSameOrigin, audit, cleanText, currentStaff, json, randomId, validISODate } from "../../_lib/security.js";
import { sendReservationEmail } from "../../_lib/email.js";

export async function onRequestPatch({ request, env, params }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  const user = await currentStaff(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (user.must_change_password) return json({ error: "Change your temporary password before using reservations." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const id = params.id;
  const existing = await env.DB.prepare("SELECT * FROM reservations WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "Reservation not found." }, 404);
  const allowed = ["pending","confirmed","declined","cancelled","completed","no_show"];
  if (body.status !== undefined && !allowed.includes(body.status)) return json({ error: "Choose a valid reservation status." }, 400);
  const status = body.status === undefined ? existing.status : body.status;
  const name = body.customer_name === undefined ? existing.customer_name : cleanText(body.customer_name, 100);
  const phone = body.customer_phone === undefined ? existing.customer_phone : cleanText(body.customer_phone, 30);
  const email = body.customer_email === undefined ? existing.customer_email : (cleanText(body.customer_email, 254).toLowerCase() || null);
  const date = body.reservation_date === undefined ? existing.reservation_date : cleanText(body.reservation_date, 10);
  const time = body.reservation_time === undefined ? existing.reservation_time : cleanText(body.reservation_time, 5);
  const guests = body.guest_count === undefined ? existing.guest_count : Number(body.guest_count);
  const occasion = body.occasion === undefined ? existing.occasion : cleanText(body.occasion, 80) || null;
  const notes = body.special_requests === undefined ? existing.special_requests : cleanText(body.special_requests, 1000) || null;
  if (name.length < 2 || phone.length < 7 || !validISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(guests) || guests < 1 || guests > 40) return json({ error: "Check the guest details, date, time and guest count." }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address or leave it blank." }, 400);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE reservations SET customer_name=?, customer_phone=?, customer_email=?, reservation_date=?,
        reservation_time=?, guest_count=?, occasion=?, special_requests=?, status=?, updated_by_user_id=?, updated_at=?, version=version+1
        WHERE id=?`).bind(name, phone, email, date, time, guests, occasion, notes, status, user.id, now, id),
      env.DB.prepare(`INSERT INTO reservation_events
        (id, reservation_id, actor_user_id, event_type, previous_status, new_status, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(randomId(), id, user.id, status !== existing.status ? "status_changed" : "reservation_updated", existing.status, status, JSON.stringify({ changed: true }))
    ]);
  } catch {
    return json({ error: "The reservation update could not be saved. Please try again." }, 500);
  }
  await audit(env, user.id, status !== existing.status ? "reservation_status_changed" : "reservation_updated", "reservation", id, { from: existing.status, to: status });

  let notification = null;
  if (status === "confirmed" && existing.status !== "confirmed" && email) {
    notification = await sendReservationEmail({
      request, env,
      reservation: {
        id, customer_name: name, customer_email: email,
        reservation_date: date, reservation_time: time, guest_count: guests
      },
      templateKey: "reservation-confirmed",
      eventKey: "reservation:" + id + ":confirmed:v" + (Number(existing.version || 1) + 1)
    });
  }
  return json({
    ok: true,
    message: "Reservation updated.",
    notification: notification ? (notification.sent ? "confirmation_email_sent" : "confirmation_email_failed") : null
  });
}
