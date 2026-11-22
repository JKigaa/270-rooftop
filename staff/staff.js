(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const loginPanel = $("loginPanel"), appPanel = $("appPanel");
  const message = (id, text) => { $(id).textContent = text || ""; };
  async function api(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }
  function showLogin(text = "") {
    appPanel.classList.add("hidden"); loginPanel.classList.remove("hidden");
    message("loginMessage", text);
  }
  function showApp(user) {
    loginPanel.classList.add("hidden"); appPanel.classList.remove("hidden");
    $("staffName").textContent = user.full_name + " · " + user.role;
    $("passwordNotice").classList.toggle("hidden", !user.must_change_password);
    loadReservations();
  }
  async function loadReservations() {
    try {
      const data = await api("/api/reservations");
      const rows = data.reservations || [];
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
      $("pendingCount").textContent = rows.filter(r => r.status === "pending").length;
      $("confirmedCount").textContent = rows.filter(r => r.status === "confirmed").length;
      $("todayCount").textContent = rows.filter(r => r.reservation_date === today).length;
      const tbody = $("reservationRows");
      tbody.replaceChildren();
      if (!rows.length) {
        const tr = document.createElement("tr"), td = document.createElement("td");
        td.colSpan = 5; td.className = "empty"; td.textContent = "No reservations have been entered yet.";
        tr.append(td); tbody.append(tr);
      } else {
        rows.forEach(r => {
          const tr = document.createElement("tr");
          [r.customer_name, r.reservation_date + " · " + r.reservation_time, String(r.guest_count), r.source, r.status.replace("_", " ")].forEach(value => {
            const td = document.createElement("td"); td.textContent = value; tr.append(td);
          });
          tbody.append(tr);
        });
      }
      message("reservationMessage", "");
    } catch (error) {
      message("reservationMessage", error.message);
      if (error.message.includes("sign in")) showLogin(error.message);
    }
  }
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault(); message("loginMessage", "");
    const button = event.currentTarget.querySelector("button");
    button.disabled = true; button.textContent = "Signing in…";
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
      showApp(data.user);
    } catch (error) { message("loginMessage", error.message); }
    finally { button.disabled = false; button.textContent = "Sign in"; }
  });
  $("logoutButton").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } finally { showLogin(); }
  });
  $("refreshButton").addEventListener("click", loadReservations);
  $("passwordForm").addEventListener("submit", async event => {
    event.preventDefault(); message("passwordMessage", "");
    try {
      await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: $("currentPassword").value, new_password: $("newPassword").value }) });
      message("passwordMessage", "Password updated. Please sign in again.");
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      setTimeout(() => showLogin("Your password has been changed. Sign in with the new password."), 900);
    } catch (error) { message("passwordMessage", error.message); }
  });
  api("/api/auth/me").then(data => data.user ? showApp(data.user) : showLogin()).catch(() => showLogin());
})();
