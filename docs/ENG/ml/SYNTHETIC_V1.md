# `synthetic-v1` Dataset Generation and Decision Record

## Decision Summary

- decision date: 2026-08-26
- first dataset language: English
- multilingual readiness: include `language`, `locale`, and per-language
  taxonomy aliases from the start
- dataset size: 800 records
- intents: 8, balanced at 100 each
- canonical item coverage: 33 food/drink items
- intended use: first training bootstrap and pipeline validation
- forbidden use: final test set for claiming real user performance

## Selected Intents

```text
add_item
consume_item
mark_low
throw_away
add_to_buy
query_inventory
unknown
needs_clarification
```

`unknown` and `needs_clarification` were separated. `unknown` means a sentence
without a currently supported relevant action, while `needs_clarification` means
there may be a relevant request but there is not enough information to choose a
safe action.

Examples:

```text
I like coffee                 -> unknown
We're out of drinks           -> needs_clarification
Put that on the list          -> needs_clarification
```

This distinction was chosen so ambiguous requests are not thrown away as simple
failures, but instead become a learnable and evaluable “must ask a question”
case.

## Why Start With English

The current app and parser are both English-centered, and it is simpler to find
data, split, and evaluation errors inside one language first. But to avoid
rebuilding the structure later when Korean is added, every record already
includes:

```json
{
  "language": "en",
  "locale": "en-US",
  "intent": "mark_low",
  "normalized": {"item_name": "milk"}
}
```

The taxonomy separates canonical IDs from language-specific aliases:

```json
{
  "id": "milk",
  "aliases": {
    "en": ["milk"],
    "ko": ["우유"]
  }
}
```

At the Korean stage, the project only needs to add a generator, reviewed data,
aliases, and language-specific evaluation slices. The English TF-IDF model will
not automatically understand Korean, so Korean-only or multilingual model
comparisons will remain separate experiments.

## Generation Method

A deterministic, reproducible generator is used.

- generator: `ml/data_generation/generate_synthetic.py`
- scenarios: `ml/data_generation/scenarios-v1.json`
- taxonomy: `ml/taxonomy/grocery-v1.json`
- seed: `20260826`
- dataset: `ml/datasets/synthetic-v1.jsonl`
- manifest: `ml/manifests/synthetic-v1.json`

The same code, taxonomy, scenarios, and seed produce the same sentences and
labels. The dataset hash is stored in the manifest.

The taxonomy has now expanded beyond the initial 10-item setup and contains 33
canonical items. Examples: `milk`, `oat_milk`, `cheese`, `spinach`, `lettuce`,
`pasta`, `chicken`, `tea`, `sparkling_water`, `ice_cream`,
`peanut_butter`.

The generator also no longer hardcodes only the first alias for each item or
category. It rotates English aliases deterministically using template position
and intent-specific offsets. So the same canonical item can surface as
`milk` / `whole milk`, `coffee` / `ground coffee`, and similar variants.

## Record Structure

Each record includes:

- raw text and language/locale
- intent
- raw entity spans
- normalized canonical values
- phrase family
- difficulty
- clarification requirement
- source and generator/taxonomy version
- evaluation tags such as category/item

Example:

```json
{
  "text": "We're low on drinks",
  "language": "en",
  "locale": "en-US",
  "intent": "mark_low",
  "entities": [
    {"label": "CATEGORY", "start": 13, "end": 19, "text": "drinks"}
  ],
  "normalized": {"category": "beverage"},
  "phrase_family": "mark_low:template-06",
  "source": "synthetic"
}
```

## Automatic Validation Results

- total records: 800
- records per intent: 100
- duplicate sentences: 0
- invalid entity spans: 0
- language: all `en`
- locale: all `en-US`
- distinct canonical `item_name`: 33

Validation uses both built-in generator checks and
`ml/tests/test_synthetic_dataset.py`.

## Why This Expansion Update Matters

The original `synthetic-v1` was good enough for pipeline bootstrap, but in
practice it depended too heavily on a very small item set. That created several problems:

- the annotator kept seeing very similar products in `generated_review`
- the baseline could learn intent while seeing almost no lexical diversity in items
- it risked appearing overfit to a few surfaces such as `milk`, `egg`, and `bread`
- new canonical items often could not appear in synthetic data before showing up in annotation

This update was meant to reduce that weakness.

- canonical items were expanded from a tiny starting set to 33
- item/category surface aliases now rotate deterministically rather than using
  only one fixed first alias
- annotation default suggestions were expanded too, reducing the gap between
  generated review and UI suggestions

So without increasing the total record count, the update improves both
**item coverage** and **surface variation**. That is useful for widening the
bootstrap lexicon until more human annotation accumulates.

## Data Split

Instead of random row-level splitting, the dataset uses phrase-family grouped
splitting per intent.

- train: 7 phrase families per intent
- validation: 2 phrase families per intent
- test: 1 phrase family per intent
- expected counts: train 560, validation 160, test 80

This prevents variants of the same template with only the product name changed
from leaking across splits. It also ensures every split still contains all
intents by grouping per intent.

## First Baseline Result

A TF-IDF + Logistic Regression smoke baseline on the grouped holdout of
`synthetic-v1` produced Macro-F1 = `0.1875`.

This low score is expected because the test phrase families were completely
excluded from training and TF-IDF is weak on unseen phrasing. This is not a
failure; it is the first comparison point for later models and later datasets.

Do not use this score to claim real-user performance. The generation rules for
synthetic sentences and the generation rules for evaluation sentences are still
related, and the distribution does not represent real conversation.

## Alternatives Considered

### Collect Only Real Data and Use No Generated Data

This would be the most realistic dataset, but it would take much longer before
the first model and pipeline could even be validated. The chosen approach uses
synthetic data to find technical issues first, then uses real data for the
final test set.

### Free-Generate Data Through an LLM on Every Run

This might increase expression diversity, but outputs vary by model version,
prompt, and temperature, and they create both cost and reproducibility issues.
Version 1 used fixed scenarios and a fixed seed. If LLM-generated data is added
later, provider/model/prompt/temperature and raw-response hash must be recorded
in the manifest.

### Keep Only the Original 7 Intents

If ambiguous requests are mixed into `unknown`, the system cannot distinguish
between irrelevant conversation and requests that need a follow-up question. So
`needs_clarification` was added as a separate intent.

### Generate English and Korean at the Same Time

That increases debugging and evaluation variables too early. The chosen design
stabilizes the learning loop in English first while making schema and taxonomy
multilingual from the start.

## Current Limits

- The sentences are generator-created, not real user utterances from the app.
- The taxonomy is still a small initial list, not a formal food ontology.
- Item diversity has improved, but it is still a hand-curated, US-kitchen-English-centered taxonomy.
- Phrase families are still scenario-template based.
- The category resolver is not yet connected to the production parser.
- Production `/annotate` supports span labeling separately from the general correction UI.
- The baseline trains only intent; it does not use entities or normalized values.
- The baseline is single-intent only, and annotation-v2 multi-action records are
  excluded rather than collapsed to a first intent; the excluded count is
  recorded in metrics.
- There is still no real frozen test set.

## How to Run

Regenerate the dataset:

```bash
source ml/.venv/bin/activate
python ml/data_generation/generate_synthetic.py
```

Validate:

```bash
pytest ml/tests
```

Train the baseline:

```bash
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
```

## Next Decision Points

The following should not be decided automatically. They depend on later data collection.

1. whether Korean should use a separate model or join a multilingual model
2. whether the taxonomy should stay manually managed or adopt an external standard
3. whether to mix LLM-generated data into `v2`
4. what promotion threshold should count as DistilBERT being meaningfully better than TF-IDF
5. what retention and de-identification policy should apply to production raw text

Final model comparisons must be run on a human-written, human-reviewed frozen
test set, not on synthetic test data.

## Current Link to Human Data

- `synthetic-v1` 800: first training bootstrap and pipeline validation
- `/annotate` training candidates 100–200: reviewed reinforcement from real expressions
- `/annotate` evaluation candidates 100+: independent validation/test candidates
- evaluation candidates become frozen test data only after deduplication and
  phrase-family grouped review
- multi-action records are preserved structurally and excluded from current
  single-intent training until a separate baseline exists
