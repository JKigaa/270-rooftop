import { assertSameOrigin, cleanText, json, randomId, validEmail, validISODate } from "../../_lib/security.js";
import { sendReservationEmail } from "../../_lib/email.js";

function isWithinOpeningHours(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const opening = weekday === 0 || weekday === 6 ? "07:00" : "06:00";
  return time >= opening && time <= "22:30";
}

export async function onRequestPost({ request, env }) {
  if (!assertSameOrigin(request)) return json({ error: "Request rejected." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid reservation details." }, 400); }

  const name = cleanText(body.name, 80);
  const phone = cleanText(body.phone, 30);
  const email = cleanText(body.email, 254).toLowerCase();
  const date = cleanText(body.date, 10);
  const time = cleanText(body.time, 5);
  const guests = Number(body.guests);
  const occasion = cleanText(body.occasion, 80) || null;
  const notes = cleanText(body.notes, 1000) || null;

  if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || phone.replace(/\D/g, "").length > 15 ||
      !validEmail(email) || !validISODate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !Number.isInteger(guests) || guests < 1 || guests > 40 || !isWithinOpeningHours(date, time)) {
    return json({ error: "Please check your name, phone, email, date, time and guest count." }, 400);
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  if (date < today) return json({ error: "Please choose a future date." }, 400);

  const id = randomId();
  const reference = "270-" + date.slice(2).replace(/-/g, "") + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO reservations
        (id, reference_code, customer_name, customer_phone, customer_email, reservation_date, reservation_time,
         guest_count, occasion, special_requests, source, status, created_by_user_id, updated_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website', 'pending', NULL, NULL)`)
        .bind(id, reference, name, phone, email, date, time, guests, occasion, notes),
      env.DB.prepare(`INSERT INTO reservation_events
        (id, reservation_id, actor_user_id, event_type, new_status, details_json)
        VALUES (?, ?, NULL, 'reservation_created', 'pending', ?)`)
        .bind(randomId(), id, JSON.stringify({ source: "website" }))
    ]);
  } catch {
    return json({ error: "We couldn't save your reservation just now. Please try again or contact us on WhatsApp." }, 500);
  }

  const reservation = {
    id, reference_code: reference, customer_name: name, customer_phone: phone,
    customer_email: email, reservation_date: date, reservation_time: time,
    guest_count: guests, status: "pending"
  };
  const emailResult = await sendReservationEmail({
    request, env, reservation, templateKey: "reservation-received",
    eventKey: "reservation:" + id + ":received:v1"
  });

  return json({
    ok: true,
    message: "Your reservation request has been received.",
    reservation: { reference_code: reference, status: "pending" },
    email_sent: emailResult.sent
  }, 201);
}
