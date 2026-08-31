# Jangoing Action Items

Last updated: 2026-08-31

This document is the operational checklist for moving from annotation
infrastructure to an English NLP MVP. [PLAN.md](./PLAN.md) describes the
broader product roadmap; this file tracks the next concrete deliverables and
completion gates.

## Current Status

- [x] Add per-item low thresholds and quantity-derived Low/Out status.
- [x] Add natural-language `set_low_threshold` parsing and annotation support.
- [x] Apply D1 migration 0009 and deploy the inventory threshold update.
- [x] Implement atomic guided initial-fridge setup in Worker, local API, and Home.
- [ ] Apply D1 migration 0010 and deploy the fridge setup Worker before Vercel.
- [ ] Verify one production setup with a test household before wider use.
- [x] Define the artwork-first, vision-later item media architecture.
- [ ] Choose authentication or a constrained household upload token before
  exposing any production media upload endpoint.
- [ ] Implement R2/D1 item media storage only after the upload security gate.
- [x] Store original `reference_date`, `timezone`, and inference timestamp.
- [x] Normalize relative expiry language with deterministic shared code.
- [x] Ground assistant expiry proposals to original inference context.
- [x] Display temporal context and normalized suggestions in the expiry queue.
- [x] Add non-overwriting, temporally explicit annotation queue seed v2.
- [x] Add relevance queues and reviewed relevance export.
- [x] Deploy the temporal changes and seed v2 to production.
- [ ] Collect enough reviewed English data for the first human-data baseline.

## 1. Apply Current Changes

- [x] Push the temporal commits to `main`.
- [x] Deploy the Cloudflare Worker.
- [x] Seed `annotation-queue-seed-v2` into production D1.
- [x] Deploy the updated annotation UI through Vercel.
- [ ] Open an expiry queue sample and verify the Temporal context card.
- [ ] Confirm that `tomorrow` is normalized from the displayed reference date,
  not the current annotation date.
- [ ] Compare v1 and v2 row counts in D1.
- [ ] Optionally remove only unannotated v1 seed rows after verifying v2.

```bash
cd /home/jjiwoo/.workspace/jangoing

git push origin main
npm run deploy:api
npm run annotation:seed-queues -- --remote
```

The temporal changes do not require a migration. The later inventory threshold
update requires migration 0009 before its Worker deployment.

## 2. Annotation Milestones

Counts below refer to human-reviewed records, not raw generated candidates.
Generated and AI-drafted labels do not count until an annotator verifies and
saves them.

### Gate A: Workflow pilot

Target: 300 reviewed training candidates and 100 evaluation candidates.

- [ ] Review at least 30 examples from every queue currently in use.
- [ ] Record recurring ambiguity in
  [ANNOTATION_CONVENTIONS_KO.md](../annotation/ANNOTATION_CONVENTIONS_KO.md).
- [ ] Check that expiry, normalized item values, multi-action records, and
  relevance labels can all be saved without manual database repair.
- [ ] Audit 50 random annotations for span boundaries and normalized values.
- [ ] Do not train a production candidate at this gate; use it to fix the
  collection workflow.

### Gate B: First human-data baseline

Target: 1,000 reviewed training candidates and 200 evaluation candidates.

- [ ] Include all supported actionable intents.
- [ ] Reach at least 50 reviewed training examples per supported intent.
- [ ] Reach at least 100 reviewed examples for each relevance class.
- [ ] Keep `domain_non_actionable` larger than `unrelated`; it is the harder
  and more useful negative class.
- [ ] Ensure evaluation records come from actual user data where possible.
- [ ] Train TF-IDF relevance and single-intent baselines.
- [ ] Treat the resulting metrics as a baseline, not an MVP launch gate.

### Gate C: English MVP dataset

Target: 3,000-5,000 reviewed training candidates and at least 500 independent
evaluation candidates.

- [ ] Reach 200-300 examples for each common intent.
- [ ] Collect at least 1,000 reviewed `ITEM` spans.
- [ ] Collect 300-500 reviewed `EXPIRY_DATE` spans across multiple phrase
  families and calendar contexts.
- [ ] Collect at least 300 reviewed examples each for quantity, unit, location,
  and category where the product requires those slots.
- [ ] Include spelling errors, indirect requests, contractions, generic item
  mentions, product subtypes, and multi-action utterances.
- [ ] Compare TF-IDF with a DistilBERT-class intent/relevance model.
- [ ] Train and evaluate a token-classification slot model.
- [ ] Select a model only after per-class and per-entity error analysis.

### Later stability target

Target: 8,000-15,000 reviewed records, driven by production errors rather than
uniform synthetic expansion.

- [ ] Prioritize real corrections, low-confidence traffic, and new phrase
  families.
- [ ] Add data only where evaluation errors show a measurable gap.
- [ ] Monitor performance by intent, entity, phrase family, and input source.

## 3. Annotation Priority

Use this order until Gate B:

1. `expiry`: validate temporal context and build `EXPIRY_DATE` coverage.
2. `domain_non_actionable`: collect grocery-domain hard negatives.
3. `preference_context`: separate persistent context from immediate actions.
4. `generated_review`: broaden intent, item, and surface-form coverage.
5. `low_confidence`: capture difficult or ambiguous examples.
6. `correction` and `confirmed_unannotated`: reserve for actual user traffic.
7. `evaluation_holdout`: use actual user records and avoid synthetic test data.

AI drafts may prefill annotations, but the human-reviewed saved annotation is
the only ground truth.

## 4. Dataset Quality Gates

Complete these checks before every model comparison:

- [ ] Remove exact duplicate utterances.
- [ ] Detect near-duplicate templates and alias-only variations.
- [ ] Keep phrase families from leaking across frozen train/evaluation splits.
- [ ] Report class and entity-span distributions.
- [ ] Verify every required normalized value.
- [ ] Verify every relative date against stored temporal context.
- [ ] Keep generated source metadata so synthetic and actual-user performance
  can be reported separately.
- [ ] Freeze dataset hashes and manifests for reproducible experiments.
- [ ] Never use annotation time as the meaning of relative temporal language.

## 5. Export and Train

Export reviewed production records:

```bash
cd /home/jjiwoo/.workspace/jangoing

npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl

npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

Train the current baseline:

```bash
source ml/.venv/bin/activate
python ml/train_baseline.py ml/data/reviewed-train.jsonl
pytest ml/tests
```

Before accepting a new model:

- [ ] Compare against the previous frozen evaluation set.
- [ ] Review per-class precision, recall, F1, and confusion matrix.
- [ ] Review entity exact-span and normalized-value errors separately.
- [ ] Record dataset hash, Git commit, random seed, and model artifact version.
- [ ] Do not promote a model based only on aggregate accuracy.

## Next Immediate Action

Verify one production expiry annotation end to end, and then complete the
300/100 workflow pilot before expanding the dataset aggressively.

## Product Catalog Track

This track is independent of the first intent/relevance baseline. Do not delay
the current annotation milestone to import a large external catalog.

- [ ] Verify the current Open Food Facts schema and license obligations from
  its official dataset documentation.
- [ ] Define a versioned `grocery-v2` schema for category, product family,
  brand, item, aliases, provenance, and canonical lifecycle.
- [ ] Write migration decisions for current conflicts including `soda`,
  `milk`, and `whole_milk`.
- [ ] Remove taxonomy knowledge duplication between the catalog and hardcoded
  normalized-value seeds.
- [ ] Build a filtered importer for 100-500 curated English product concepts.
- [ ] Implement an exact-alias entity-linking baseline before fuzzy or
  embedding retrieval.
- [ ] Add seen-product, unseen-alias, unseen-product, and catalog-unknown
  evaluation slices.

The rationale and safeguards are in
[OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md](../ml/OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md).
