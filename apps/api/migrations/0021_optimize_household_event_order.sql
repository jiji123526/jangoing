DROP INDEX IF EXISTS idx_events_household_created_at;

CREATE INDEX idx_events_household_created_at
  ON events(household_id, created_at, id);
