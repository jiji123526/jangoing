CREATE UNIQUE INDEX idx_household_memberships_one_per_user
  ON household_memberships(user_id);
