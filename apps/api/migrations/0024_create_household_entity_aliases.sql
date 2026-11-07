CREATE TABLE household_entity_aliases (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (length(trim(surface)) BETWEEN 1 AND 120),
  normalized_surface TEXT NOT NULL
    CHECK (length(trim(normalized_surface)) BETWEEN 1 AND 120),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ITEM')),
  canonical_key TEXT NOT NULL
    CHECK (
      length(trim(canonical_key)) BETWEEN 1 AND 120
      AND substr(canonical_key, 1, 1) GLOB '[a-z0-9]'
      AND canonical_key NOT GLOB '*[^a-z0-9_]*'
    ),
  category_id TEXT NOT NULL CHECK (length(trim(category_id)) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK (
    source IN (
      'manual',
      'confirmed_correction',
      'inventory_observed',
      'asr_correction',
      'imported_candidate'
    )
  ),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INTEGER NOT NULL DEFAULT 1 CHECK (evidence_count > 0),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, normalized_surface, entity_type, canonical_key),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_household_entity_aliases_lookup
  ON household_entity_aliases(household_id, normalized_surface, entity_type);

CREATE INDEX idx_household_entity_aliases_created_by_user_id
  ON household_entity_aliases(created_by_user_id);
