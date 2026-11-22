PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  manager_id TEXT REFERENCES staff_users(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (role = 'owner' AND manager_id IS NULL) OR
    (role IN ('manager', 'staff') AND manager_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_users_manager_id ON staff_users(manager_id);
CREATE INDEX IF NOT EXISTS idx_staff_users_role_active ON staff_users(role, is_active);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_agent TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_user_id ON staff_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry ON staff_sessions(expires_at);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  reservation_date TEXT NOT NULL,
  reservation_time TEXT NOT NULL,
  guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 1 AND 40),
  occasion TEXT,
  special_requests TEXT,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('website', 'whatsapp', 'phone', 'walk_in', 'staff', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  created_by_user_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(reservation_date) = 10),
  CHECK (length(reservation_time) = 5)
);

CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status_date ON reservations(status, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_phone ON reservations(customer_phone);

CREATE TABLE IF NOT EXISTS reservation_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_events_reservation ON reservation_events(reservation_id, created_at);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  template_key TEXT NOT NULL CHECK (template_key IN ('welcome', 'reservation-received', 'reservation-confirmed', 'reservation-cancelled', 'reservation-reminder', 'reservation-updated')),
  event_key TEXT NOT NULL UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'sent', 'failed')),
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_reservation ON email_logs(reservation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(delivery_status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
