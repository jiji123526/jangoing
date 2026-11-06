ALTER TABLE inference_logs
  ADD COLUMN relevance_class TEXT;

ALTER TABLE inference_logs
  ADD COLUMN relevance_confidence REAL;

ALTER TABLE inference_logs
  ADD COLUMN relevance_version TEXT;
