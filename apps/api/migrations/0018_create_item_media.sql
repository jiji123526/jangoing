CREATE TABLE item_media (
  household_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, item_name),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_item_media_created_by_user_id
  ON item_media(created_by_user_id);
