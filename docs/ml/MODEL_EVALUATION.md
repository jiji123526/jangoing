# Model Evaluation and Logging Standard

## Purpose

jangoing treats model learning and validation as the primary project. Product
interactions exist both to help users and to create reviewed, versioned evidence
about where the language and recommendation systems improve or regress.

## Logging Is Default

Every interpretation attempt must create an inference record, including unknown,
cancelled, rejected, and corrected requests. Logging must not depend on an
inventory event being created.

Minimum inference fields:

- anonymized interaction, session, and household identifiers
- timestamp, locale, timezone, input modality, and turn index
- current utterance plus references to the permitted context snapshot
- predicted intent, raw slot spans, normalized slots, and confidence
- parser/model, normalizer, prompt, schema, and application versions
- dataset version and experiment/run identifier when applicable
- latency by pipeline stage, fallback path, and validation errors
- user outcome: confirmed, corrected, cancelled, rejected, or timed out
- corrected intent, spans, normalized values, and correction duration

Sensitive conversational text must have an explicit retention policy. Training
exports should use pseudonymous identifiers and exclude secrets or unrelated
personal content.

## Reproducible Experiments

Every training run records:

- source commit and dirty/clean state
- immutable dataset and split versions
- split strategy and leakage checks
- model and tokenizer identifiers
- hyperparameters, seed, hardware, duration, and dependency lock hash
- checkpoints and final artifact digest
- offline metrics, slice metrics, calibration plots, and error samples

The production model changes only after it beats the current baseline on the
frozen test set and passes safety and latency gates. Results are compared in a
model registry or experiment dashboard; they must not live only in terminal logs.

## Language Metrics

Report at minimum:

- intent macro-F1 and per-intent precision/recall/F1
- entity-level slot precision/recall/F1
- normalization accuracy by field
- end-to-end exact action match
- unknown detection AUROC/F1 and false-accept rate
- expected calibration error and reliability curves
- correction rate, abandonment rate, and median confirmation time
- p50/p95 end-to-end and stage latency
- multi-action exact match, per-action intent F1, and action-to-entity assignment F1

Always slice results by phrasing family, input modality or activation mode,
speaker role, utterance length, action count, multi-turn dependency, ambiguity,
ASR noise, unseen item, date expression, and user goal. A single aggregate
score is not sufficient.

The current TF-IDF baseline is explicitly single-intent. Exported multi-action
records must not be collapsed to their first intent; they are excluded and the
excluded count is written to run metadata until a multi-label or structured
prediction baseline exists.

## Dataset Candidate Policy

- `synthetic-v1` bootstraps training and validates the pipeline; it is not a
  human evaluation set.
- Human examples influenced by templates, model output, or error analysis are
  training candidates.
- Independently written natural examples are evaluation candidates.
- An evaluation candidate becomes validation or frozen test data only after
  duplicate removal, phrase-family grouping, human review, and version approval.
- Initial collection targets are 100–200 human training candidates and 100+
  human evaluation candidates. Counts never replace quality or coverage review.

## Context Evaluation

Context must be explicit and inspectable: recent turns, confirmed household
state, preferences, dietary constraints, goals, budget, location, and time. Each
prediction records which context sources were used.

Contextual test sets should measure:

- request detection within non-command conversation
- correct antecedent and entity resolution across turns
- relevant-context retrieval precision/recall
- state consistency and contradiction handling
- clarification quality when required information is missing
- resistance to stale, unrelated, or unauthorized context

State-changing actions continue to require confirmation even when contextual
confidence is high.

## Recommendation Evaluation

Recommendations begin with rules and retrieval before learned ranking. Candidates
may come from inventory, expiry, shopping list, dietary goals, preferences,
budget, and explicitly connected deal sources.

Offline metrics:

- Recall@K, NDCG@K, MAP@K, and catalog coverage
- constraint satisfaction and unsafe recommendation rate
- diversity, novelty, substitution quality, and deal freshness
- explanation faithfulness: cited inputs must actually affect ranking

Online metrics:

- accept, save, add-to-list, purchase, dismiss, and correction rates
- incremental savings and expired-food reduction
- goal adherence without optimizing for unhealthy engagement
- retention measured alongside complaint and opt-out rates

Deal recommendations must include source, price, unit price, merchant, location,
and observed/expiry timestamps. Stale or unverifiable deals are not shown as
current facts.

## Evaluation Gates

No model or recommender is promoted solely because one metric increased. A
release must preserve safety constraints, show no material regression on critical
slices, meet latency limits, and include a rollback target. Production outcomes
are monitored by model version so development-over-development changes remain
visible.
