CREATE TABLE corrections (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  raw_utterance TEXT NOT NULL,
  predicted_interpretation TEXT NOT NULL,
  corrected_interpretation TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  was_corrected INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_corrections_event_id ON corrections(event_id);
CREATE INDEX idx_corrections_created_at ON corrections(created_at);
