ALTER TABLE item_media ADD COLUMN media_id TEXT;
ALTER TABLE item_media ADD COLUMN object_key TEXT;
ALTER TABLE item_media ADD COLUMN content_type TEXT;
ALTER TABLE item_media ADD COLUMN byte_size INTEGER;
ALTER TABLE item_media ADD COLUMN sha256 TEXT;

CREATE UNIQUE INDEX idx_item_media_media_id
  ON item_media(media_id)
  WHERE media_id IS NOT NULL;

CREATE INDEX idx_item_media_household_sha256
  ON item_media(household_id, sha256)
  WHERE sha256 IS NOT NULL;
