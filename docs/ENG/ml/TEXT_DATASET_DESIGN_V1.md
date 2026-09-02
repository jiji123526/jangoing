# Text Dataset Design v1

## Purpose

This document fixes the dataset design used to train and evaluate Jangoing's
English text NLU before voice input is added.

Core principles:

```text
candidate != ground truth
human-reviewed annotation -> task-specific exports
generated data -> training bootstrap only
independent natural text -> frozen evaluation
```

One reviewed corpus is exported separately for relevance, intent, slot, and
joint tasks. In the voice stage, ASR transcripts are connected into this text
pipeline, so text errors must be measurable independently first.

## 1. Current Available Data

### Repository Candidate Data

| Dataset | Records | Current role |
| --- | ---: | --- |
| `synthetic-v1` | 800 | actionable/clarification/legacy unknown candidates and pipeline bootstrap |
| `relevance-candidates-v1` | 600 | non-actionable relevance review candidates |
| total | 1,400 | annotation candidates, not reviewed ground truth |

`relevance-candidates-v1` has this composition:

| Candidate class | Records |
| --- | ---: |
| `contextual_preference` | 200 |
| `domain_non_actionable` | 300 |
| `unrelated` | 100 |

`synthetic-v1` contains 100 examples each of 8 intents:

```text
add_item
add_to_buy
consume_item
mark_low
needs_clarification
query_inventory
throw_away
unknown
```

### Important Gaps in the Current Data

The current contract supports 11 intents, but `synthetic-v1` is missing:

```text
update_expiry
set_low_threshold
mark_out
```

There are also these limitations:

- it still uses `intent:template-N` families rather than the current meaning-based phrase families
- it has no `LOCATION` or `EXPIRY_DATE` spans
- it has only 30 `QUANTITY` spans and 30 `UNIT` spans
- every actionable candidate is single-action
- some older `unknown` templates may now become non-actionable under the
  relevance-first convention
- generated candidate labels are not answers until humans review them
- the actual reviewed distribution in production D1 still requires a separate snapshot

So the 1,400 candidates are not merged directly into one training file.

## 2. Training Problem Decomposition

### Stage A: Relevance

Classify every reviewed utterance into one of four classes:

```text
actionable
contextual_preference
domain_non_actionable
unrelated
```

This stage is not just a domain detector looking for grocery words. In
particular, `domain_non_actionable` must be represented strongly enough that the
model learns cases where action-like vocabulary appears without a real request.

### Stage B: Intent

Use only `actionable` records.

```text
add_item
update_expiry
set_low_threshold
consume_item
mark_low
mark_out
throw_away
add_to_buy
query_inventory
needs_clarification
unknown
```

Here `unknown` does not mean preference or unrelated language. It means an
`unsupported_request` whose meaning is clear but is outside current capability.
Preference and unrelated text stop at Stage A.

The first TF-IDF baseline uses only single-action records. Multi-action records
are not collapsed to a first intent; they are held for later multi-label or
structured action models.

### Stage C: Entity Span

Learn per-action spans for actionable records:

```text
ITEM
CATEGORY
QUANTITY
UNIT
LOCATION
EXPIRY_DATE
```

`ITEM_CONDITION` is currently a legacy-compatibility label and is excluded from
the default new collection target. Expressions such as `out of`, `low`, or
`buy` are language evidence for intent, not entities.

### Stage D: Normalization

Evaluate span modeling and normalization separately.

- `ITEM`, `CATEGORY`, `UNIT`, `LOCATION`: versioned taxonomy and alias resolver
- `QUANTITY`: deterministic number parser
- `EXPIRY_DATE`: deterministic normalizer using stored `reference_date + timezone`
- new item: save as a household-scoped value and create a catalog proposal with provenance

Do not merge together cases where the span model was right but the resolver was
wrong, and cases where the span itself was wrong.

### Stage E: Joint Action

The final evaluation checks whether the whole structure is correct:

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "entities": [
        {
          "label": "ITEM",
          "start": 16,
          "end": 20,
          "text": "milk",
          "normalized_value": "milk"
        }
      ],
      "phrase_family": "state_out_of_entity"
    }
  ]
}
```

## 3. First Human Baseline Target

The first formal text baseline gate is:

```text
training:   1,000 reviewed records
evaluation:   200 independently collected reviewed records
```

### Training Relevance Distribution

| Relevance | Target |
| --- | ---: |
| `actionable` | 710 |
| `contextual_preference` | 100 |
| `domain_non_actionable` | 150 |
| `unrelated` | 40 |
| total | 1,000 |

`domain_non_actionable` should outnumber `unrelated`. If fully unrelated
examples dominate, the model may learn the trivial shortcut “contains grocery
vocabulary or not.” Training will use class weights and macro-F1, so there is
no reason to force a fake 25% uniform class distribution.

### Actionable Training Intent Distribution

The counts below are minimum record coverage for records containing that intent.
Multi-action records count toward multiple intent rows, but they do not reduce
the overall `actionable` target of 710 records.

| Intent | Minimum records containing intent |
| --- | ---: |
| `add_item` | 80 |
| `update_expiry` | 60 |
| `set_low_threshold` | 50 |
| `consume_item` | 70 |
| `mark_low` | 70 |
| `mark_out` | 60 |
| `throw_away` | 60 |
| `add_to_buy` | 80 |
| `query_inventory` | 80 |
| `needs_clarification` | 60 |
| `unknown` | 40 |
| minimum intent-bearing coverage | 710 |

This is only the minimum baseline composition. Intents with higher error rates
should later receive extra correction and low-confidence data.

### Evaluation Distribution

The 200 evaluation records should be independently written or naturally
collected, not generated by lightly editing existing templates.

| Relevance | Target |
| --- | ---: |
| `actionable` | 110 |
| `contextual_preference` | 25 |
| `domain_non_actionable` | 45 |
| `unrelated` | 20 |
| total | 200 |

Ensure at least 10 actionable evaluation records per each of the 11 intents.
Multi-action records can contribute to multiple intent coverages, but do not
replace the total target of 110 actionable evaluation records.
This is still too small for strong final performance claims, but it is large
enough to expose the first per-intent failure patterns.

## 4. Entity and Difficulty Coverage

Minimum span targets in the training actionable corpus:

| Entity | Minimum reviewed spans |
| --- | ---: |
| `ITEM` | 500 |
| `CATEGORY` | 100 |
| `QUANTITY` | 150 |
| `UNIT` | 120 |
| `LOCATION` | 80 |
| `EXPIRY_DATE` | 120 |

One utterance can contribute to several entity targets at once. Do not mark
unnecessary entities just to hit the count.

Additional coverage requirements:

- 10–15% of actionable training should be multi-action
- at least 15% of actionable evaluation should be multi-action
- include both direct requests and indirect state reports
- separate item mentions from category mentions
- track seen-item vs unseen-item splits as explicit tags
- include absolute dates, relative dates, weekdays, and correction wording
- include contractions, politeness, word-order variation, and typos
- keep ASR-like text noise as a separate slice instead of mixing it blindly
  into the first clean-text baseline

## 5. Contrast Sets That Must Be Collected

Prioritize sentence bundles that reuse similar words but change labels.

```text
We're low on milk.                 -> mark_low
We're out of milk.                 -> mark_out
Tell me when milk reaches one.     -> set_low_threshold
Add milk to the shopping list.     -> add_to_buy
Milk is expensive these days.      -> domain_non_actionable
I prefer oat milk.                 -> contextual_preference
```

```text
Add milk expiring Friday.          -> add_item
The milk expires Friday.           -> update_expiry
When does the milk expire?         -> query_inventory
Throw away the expired milk.       -> throw_away
```

```text
We finished the milk.              -> consume_item
We're out of milk.                 -> mark_out
Buy more milk.                     -> add_to_buy
```

These contrasts deliberately place similar lexical cues under multiple labels to
reduce shortcuts. But variations of one template bundle must not be split across
train and evaluation.

## 6. Role of Each Source

| Source | Default purpose | Evaluation use |
| --- | --- | --- |
| `generated_review` | coverage bootstrap and rare-intent support | forbidden |
| `correction` | reinforce actual model errors | training-first because it was collected after seeing the error |
| `low_confidence` | reinforce decision boundary and ambiguity | training-first |
| `expiry` | reinforce temporal span/normalization | training-first |
| `confirmed_unannotated` | recover real-use distribution | partially usable after checking independence |
| `evaluation_holdout` | frozen natural-expression candidates | recommended |
| direct blind elicitation | collect independent expressions for missing classes | usable if prompt wording was not exposed |

External product datasets are used only as catalog evidence for item, brand,
alias, and category. Do not treat Open Food Facts product rows as natural
language action utterances.

## 7. How Evaluation Should Be Collected

Do not create evaluation examples by taking generated annotation sentences and
swapping a few words. Recommended order:

1. save naturally written product utterances from real app usage as holdout candidates
2. for missing intents, use blind elicitation with only semantic-goal cards
3. if possible, ask another writer for sentences without showing example wording
4. mark them as `evaluation_candidate` before looking at model results or training error analysis
5. review annotation, deduplicate, and near-deduplicate before freezing

Scenario cards should provide only:

```text
goal: report that an existing item has no stock
required information: one grocery item
write it as you would naturally type to the app
```

Do not show wording like `We're out of ...` directly.

The current schema stores only `train_candidate` and `evaluation_candidate`.
When the first 200-record evaluation pool is frozen, derive development 100 and
final test 100 using phrase-family grouping rules and record the IDs in a
manifest. The final test set must not be used for model selection or threshold tuning.

## 8. Order for Using Current Candidates

### Phase 0: Production Snapshot

First aggregate reviewed counts from D1 by relevance, intent, purpose, and source.
This environment cannot run the remote snapshot because it has no
`CLOUDFLARE_API_TOKEN`. Create the snapshot in an authenticated development shell
and compare it against the target.

### Phase 1: 400-Record Workflow Pilot

- training 300
- independent evaluation candidates 100
- relevance candidate pilot: preference 40, domain non-actionable 60,
  unrelated 20
- the remaining training should prioritize actionable intent and expiry gaps

This phase is not for selecting the production model yet. Its purpose is to
check whether annotation ambiguity, spans, normalization, temporal context, and
source metadata are being stored correctly.

### Phase 2: Gap-Targeted `synthetic-v2`

Do not inflate the current 1,400 candidates blindly. Instead generate only
roughly 400–600 new candidates targeting these gaps:

- `update_expiry`, `set_low_threshold`, `mark_out`
- `LOCATION`, `EXPIRY_DATE`, quantity/unit variation
- the current 40 meaning-based phrase families
- `unknown > unsupported_request`
- 2-action and 3-action sentences
- the contrast sets above
- product subtype, brand alias, category mention, unseen item

`synthetic-v2` must not silently mutate v1 rows. It needs a new version, seed,
manifest, and hash.

### Phase 3: First Human Baseline

- reviewed training 1,000
- independent reviewed evaluation 200
- TF-IDF relevance baseline
- TF-IDF single-intent baseline
- token-classification slot baseline
- deterministic normalization baseline
- joint exact-match evaluator

### Phase 4: Error-Driven Expansion

When scaling toward 3,000–5,000 reviewed training records, add correction,
low-confidence, and rare-family data based on errors from the frozen evaluation
set instead of generating uniformly. Keep development and final test separate
so the same final test is not repeatedly tuned against.

## 9. Task Export

Create the following files from the same reviewed annotation corpus:

```text
relevance-train.jsonl
relevance-evaluation.jsonl

intent-train.jsonl
intent-evaluation.jsonl

slots-train.jsonl
slots-evaluation.jsonl

joint-train.jsonl
joint-evaluation.jsonl
```

Current export commands:

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task intent \
  --train-output ml/data/intent-train.jsonl \
  --evaluation-output ml/data/intent-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/slots-train.jsonl \
  --evaluation-output ml/data/slots-evaluation.jsonl

npm run dataset:export -- --remote --task joint \
  --train-output ml/data/joint-train.jsonl \
  --evaluation-output ml/data/joint-evaluation.jsonl
```

Production utterance exports are private local artifacts and must not be
committed to Git. The committed repository should contain only generators,
synthetic candidates, schemas, manifests, and aggregate statistics.

## 10. Quality Gates Before Freeze

- use only reviewed rows with saved annotation as ground truth
- run exact duplicate and normalized near-duplicate checks
- keep phrase families from appearing in both train and evaluation
- record distribution by generated/real/elicited source
- record intent and relevance-class distributions
- record span and normalization distributions by entity label
- verify that every entity span is an exact substring of the source text
- recheck relative dates against original `reference_date + timezone`
- do not collapse multi-action into a single intent
- prevent item-alias-only template variants from crossing splits
- record annotation schema, taxonomy, and normalizer versions
- store dataset hash and split-ID manifest
- do not change development/test assignment after freezing evaluation

## 11. Implementation Gaps

Before freezing the dataset, the current infrastructure still needs:

1. preserve `inference_logs.source` and language/locale provenance in export records
2. reviewed distribution and entity coverage reporting scripts
3. stronger near-duplicate and phrase-family leakage audits
4. split-manifest tooling that freezes the evaluation pool into development and final test
5. four-class relevance TF-IDF trainer
6. BIO token conversion plus slot baseline
7. normalization accuracy and joint exact-match evaluator
8. targeted `synthetic-v2` generator plus manifest

Annotation can continue before those are done. But provenance and split tooling
must exist before publishing a frozen dataset or reporting model performance.

## Decision

The current candidate data is not discarded, but its role is constrained.

```text
synthetic-v1 + relevance-candidates-v1
-> candidate pool and bootstrap
-> human review
-> reviewed training corpus

independent natural text
-> human review
-> frozen development/test corpus
```

The next implementation priorities are a **production reviewed-distribution
report** and a **gap-targeted synthetic-v2 generator**. After that, complete
the 400-record workflow pilot and then scale to the first 1,000/200 text baseline.
