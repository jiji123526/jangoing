CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE household_memberships (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_household_memberships_user_id
  ON household_memberships(user_id);
CREATE INDEX idx_household_memberships_household_id
  ON household_memberships(household_id);

CREATE TABLE household_join_codes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_household_join_codes_household_id
  ON household_join_codes(household_id);
CREATE INDEX idx_household_join_codes_expires_at
  ON household_join_codes(expires_at);

CREATE TABLE household_app_state (
  household_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, key),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

ALTER TABLE events
  ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE events
  ADD COLUMN created_by_user_id TEXT REFERENCES users(id);

CREATE INDEX idx_events_household_created_at
  ON events(household_id, created_at);
CREATE INDEX idx_events_created_by_user_id
  ON events(created_by_user_id);

ALTER TABLE inference_logs
  ADD COLUMN household_id TEXT REFERENCES households(id);
ALTER TABLE inference_logs
  ADD COLUMN user_id TEXT REFERENCES users(id);

CREATE INDEX idx_inference_logs_household_created_at
  ON inference_logs(household_id, created_at);
CREATE INDEX idx_inference_logs_user_id
  ON inference_logs(user_id);
