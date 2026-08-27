ALTER TABLE annotations ADD COLUMN actions TEXT;

CREATE INDEX idx_annotations_schema_version
  ON annotations(annotation_schema_version);
