(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const loginPanel = $("loginPanel"), appPanel = $("appPanel");
  let currentRole = "";
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
    currentRole = user.role;
    const canManageStaff = ["owner","manager"].includes(user.role);
    $("staffName").textContent = user.full_name + " · " + user.role;
    $("staffManagement").classList.toggle("hidden", !canManageStaff || !!user.must_change_password);
    $("passwordNotice").classList.toggle("hidden", !user.must_change_password);
    document.querySelectorAll(".stats,.entry-panel,.app > .panel:not(#staffManagement)").forEach(panel => panel.classList.toggle("hidden", !!user.must_change_password));
    if (!user.must_change_password) {
      loadReservations();
      if (canManageStaff) loadStaff();
    }
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
          [r.customer_name, r.reservation_date + " · " + r.reservation_time, String(r.guest_count), r.source].forEach(value => {
            const td = document.createElement("td"); td.textContent = value; tr.append(td);
          });
          const statusCell = document.createElement("td");
          const select = document.createElement("select");
          ["pending","confirmed","declined","cancelled","completed","no_show"].forEach(status => {
            const option = document.createElement("option"); option.value = status; option.textContent = status.replace("_", " "); option.selected = status === r.status; select.append(option);
          });
          select.addEventListener("change", async () => {
            select.disabled = true;
            try { await api("/api/reservations/" + encodeURIComponent(r.id), { method: "PATCH", body: JSON.stringify({ status: select.value }) }); message("reservationMessage", "Reservation status updated."); loadReservations(); }
            catch (error) { message("reservationMessage", error.message); select.value = r.status; }
            finally { select.disabled = false; }
          });
          statusCell.append(select); tr.append(statusCell); tbody.append(tr);
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
  $("reservationForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    message("createMessage", "");
    const payload = {
      customer_name: $("guestName").value, customer_phone: $("guestPhone").value,
      customer_email: $("guestEmail").value, reservation_date: $("guestDate").value,
      reservation_time: $("guestTime").value, guest_count: Number($("guestCount").value),
      source: $("guestSource").value, occasion: $("guestOccasion").value,
      special_requests: $("guestNotes").value
    };
    try {
      const data = await api("/api/reservations", { method: "POST", body: JSON.stringify(payload) });
      message("createMessage", "Saved booking " + data.reservation.reference_code + " as pending.");
      form.reset(); $("guestCount").value = "2"; loadReservations();
    } catch (error) { message("createMessage", error.message); }
  });
  async function loadStaff() {
    try {
      const data = await api("/api/staff");
      const tbody = $("staffRows"); tbody.replaceChildren();
      (data.staff || []).forEach(person => {
        const tr = document.createElement("tr");
        [person.full_name, person.email, person.role, person.last_login_at ? new Date(person.last_login_at).toLocaleString() : "Not signed in"].forEach(value => {
          const td = document.createElement("td"); td.textContent = value; tr.append(td);
        });
        const accessCell = document.createElement("td");
        const accessButton = document.createElement("button");
        accessButton.className = "quiet"; accessButton.textContent = currentRole === "owner" && person.role !== "manager" ? "Manager controls access" : (person.is_active ? "Deactivate" : "Activate");
        accessButton.disabled = currentRole === "owner" && person.role !== "manager";
        accessButton.addEventListener("click", async () => {
          accessButton.disabled = true;
          try { await api("/api/staff/" + encodeURIComponent(person.id), { method: "PATCH", body: JSON.stringify({ is_active: !person.is_active }) }); loadStaff(); }
          catch (error) { message("staffMessage", error.message); accessButton.disabled = false; }
        });
        accessCell.append(accessButton); tr.append(accessCell); tbody.append(tr);
      });
      message("staffMessage", "");
    } catch (error) { message("staffMessage", error.message); }
  }
  $("staffForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    message("staffMessage", "");
    $("temporaryPassword").classList.add("hidden");
    try {
      const data = await api("/api/staff", { method: "POST", body: JSON.stringify({ full_name: $("newStaffName").value, email: $("newStaffEmail").value }) });
      const box = $("temporaryPassword"); box.classList.remove("hidden");
      box.replaceChildren();
      const title = document.createElement("strong"); title.textContent = "Account created — copy this temporary password now:";
      const code = document.createElement("code"); code.textContent = data.temporary_password;
      const copy = document.createElement("button"); copy.className = "quiet"; copy.textContent = "Copy password";
      copy.addEventListener("click", async () => { await navigator.clipboard.writeText(data.temporary_password); copy.textContent = "Copied"; });
      box.append(title, code, document.createElement("br"), copy);
      form.reset(); loadStaff();
    } catch (error) { message("staffMessage", error.message); }
  });
  $("loadStaffButton").addEventListener("click", loadStaff);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  $("guestDate").min = today;
  api("/api/auth/me").then(data => {
    if (!data.user) return showLogin();
    showApp(data.user);
  }).catch(() => showLogin());
})();
