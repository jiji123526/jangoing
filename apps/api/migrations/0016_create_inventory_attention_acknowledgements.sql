CREATE TABLE inventory_attention_acknowledgements (
  household_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  state_snapshot TEXT NOT NULL,
  acknowledged_by_user_id TEXT,
  acknowledged_at TEXT NOT NULL,
  PRIMARY KEY (household_id, item_name),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_attention_acknowledgements_household
  ON inventory_attention_acknowledgements(household_id);
