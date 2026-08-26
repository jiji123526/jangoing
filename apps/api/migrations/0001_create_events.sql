CREATE TABLE events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  location TEXT,
  expiration_date TEXT,
  raw_utterance TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_item_name ON events(item_name);
