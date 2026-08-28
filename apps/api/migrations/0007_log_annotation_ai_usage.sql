ALTER TABLE annotation_proposals ADD COLUMN input_tokens INTEGER;
ALTER TABLE annotation_proposals ADD COLUMN output_tokens INTEGER;
ALTER TABLE annotation_proposals ADD COLUMN estimated_cost_usd REAL;

