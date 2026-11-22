import { randomId } from "./security.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function displayDate(value) {
  const date = new Date(value + "T12:00:00Z");
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  }).format(date);
}

function displayTime(value) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "pm" : "am";
  const shownHour = hour % 12 || 12;
  return minute === "00" ? shownHour + " " + suffix : shownHour + ":" + minute + " " + suffix;
}

export async function sendReservationEmail({ request, env, reservation, templateKey, eventKey }) {
  const recipient = reservation.customer_email;
  if (!recipient) return { sent: false, skipped: true, reason: "No customer email address." };

  const logId = randomId();
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO email_logs
      (id, reservation_id, recipient_email, template_key, event_key, delivery_status, attempt_count)
     VALUES (?, ?, ?, ?, ?, 'queued', 0)`
  ).bind(logId, reservation.id, recipient, templateKey, eventKey).run();

  if (!inserted.meta?.changes) {
    const previous = await env.DB.prepare(
      "SELECT delivery_status FROM email_logs WHERE event_key = ?"
    ).bind(eventKey).first();
    if (previous?.delivery_status === "sent") return { sent: true, duplicate: true };
    return { sent: false, duplicate: true, reason: "This notification has already been attempted." };
  }

  try {
    if (!env.BREVO_API_KEY) throw new Error("Brevo API key is not configured.");
    const templateResponse = await env.ASSETS.fetch(new URL("/emails/" + templateKey + ".html", request.url));
    if (!templateResponse.ok) throw new Error("Email template could not be loaded.");
    let html = await templateResponse.text();

    const replacements = {
      customer_name: escapeHtml(reservation.customer_name),
      reservation_date: escapeHtml(displayDate(reservation.reservation_date)),
      reservation_time: escapeHtml(displayTime(reservation.reservation_time)),
      guest_count: escapeHtml(reservation.guest_count)
    };
    for (const [key, value] of Object.entries(replacements)) {
      html = html.replaceAll("{{" + key + "}}", value);
    }
    if (/{{[^}]+}}/.test(html)) throw new Error("Email template contains an unsupported placeholder.");

    const subjects = {
      "reservation-received": "We've received your reservation request | 270° Rooftop",
      "reservation-confirmed": "Your table is confirmed | 270° Rooftop",
      "reservation-cancelled": "An update to your reservation | 270° Rooftop",
      "reservation-reminder": "A reminder about your reservation | 270° Rooftop",
      "reservation-updated": "Your reservation details have been updated | 270° Rooftop"
    };
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_SENDER_NAME || "270° Rooftop",
          email: env.BREVO_SENDER_EMAIL || "jkigaa@gmail.com"
        },
        to: [{ email: recipient, name: reservation.customer_name }],
        subject: subjects[templateKey],
        htmlContent: html,
        tags: ["270-rooftop", templateKey]
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof result.message === "string" ? result.message : "Brevo rejected the email request.";
      throw new Error(message.slice(0, 300));
    }

    await env.DB.prepare(
      "UPDATE email_logs SET delivery_status='sent', provider_message_id=?, sent_at=?, updated_at=?, attempt_count=attempt_count+1, last_error=NULL WHERE event_key=?"
    ).bind(result.messageId || null, now, now, eventKey).run();
    return { sent: true, messageId: result.messageId || null };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE email_logs SET delivery_status='failed', last_error=?, updated_at=?, attempt_count=attempt_count+1 WHERE event_key=?"
    ).bind(String(error.message || "Email delivery failed.").slice(0, 500), new Date().toISOString(), eventKey).run();
    return { sent: false, reason: "The reservation was saved, but the email could not be sent." };
  }
}
