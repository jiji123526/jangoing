CREATE TABLE annotation_proposals (
  id TEXT PRIMARY KEY,
  inference_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  proposal TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  resolution TEXT,
  applied_annotation_id TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY (inference_id) REFERENCES inference_logs(id),
  FOREIGN KEY (applied_annotation_id) REFERENCES annotations(id)
);

CREATE INDEX idx_annotation_proposals_inference_id
  ON annotation_proposals(inference_id);

CREATE INDEX idx_annotation_proposals_status
  ON annotation_proposals(status);

CREATE INDEX idx_annotation_proposals_created_at
  ON annotation_proposals(created_at);
