ALTER TABLE annotations
  ADD COLUMN relevance TEXT NOT NULL DEFAULT 'actionable';

UPDATE annotations
SET relevance = 'contextual_preference'
WHERE phrase_family = 'preference_statement';

UPDATE annotations
SET relevance = 'unrelated'
WHERE phrase_family IN ('unrelated_question', 'unrelated_statement');

CREATE INDEX idx_annotations_relevance
  ON annotations(relevance);
