ALTER TABLE inference_logs
  ADD COLUMN pipeline_version TEXT;

ALTER TABLE inference_logs
  ADD COLUMN stage_trace_json TEXT;
