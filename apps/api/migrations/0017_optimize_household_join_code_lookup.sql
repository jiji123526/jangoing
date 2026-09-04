DROP INDEX IF EXISTS idx_household_join_codes_household_id;

CREATE INDEX idx_household_join_codes_active_household_created_at
  ON household_join_codes(household_id, revoked_at, created_at DESC);
