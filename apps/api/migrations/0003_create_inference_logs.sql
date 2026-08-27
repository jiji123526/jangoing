CREATE TABLE inference_logs (
  id TEXT PRIMARY KEY,
  raw_utterance TEXT NOT NULL,
  request_context TEXT NOT NULL,
  predicted_interpretation TEXT NOT NULL,
  corrected_interpretation TEXT,
  parser_version TEXT NOT NULL,
  normalizer_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source TEXT NOT NULL,
  outcome TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  event_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_inference_logs_created_at ON inference_logs(created_at);
CREATE INDEX idx_inference_logs_outcome ON inference_logs(outcome);
CREATE INDEX idx_inference_logs_parser_version ON inference_logs(parser_version);
