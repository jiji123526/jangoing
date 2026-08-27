CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  inference_id TEXT NOT NULL UNIQUE,
  intent TEXT NOT NULL,
  entities TEXT NOT NULL,
  normalized TEXT NOT NULL,
  dataset_purpose TEXT NOT NULL,
  phrase_family TEXT,
  notes TEXT,
  annotator TEXT NOT NULL,
  annotation_schema_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (inference_id) REFERENCES inference_logs(id)
);

CREATE INDEX idx_annotations_intent ON annotations(intent);
CREATE INDEX idx_annotations_dataset_purpose ON annotations(dataset_purpose);
CREATE INDEX idx_annotations_created_at ON annotations(created_at);
