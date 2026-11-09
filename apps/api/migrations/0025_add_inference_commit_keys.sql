ALTER TABLE events
  ADD COLUMN inference_id TEXT;

ALTER TABLE events
  ADD COLUMN action_index INTEGER;

CREATE UNIQUE INDEX idx_events_inference_action
  ON events(inference_id, action_index)
  WHERE inference_id IS NOT NULL AND action_index IS NOT NULL;
