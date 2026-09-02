# `relevance-candidates-v1` Generation and Operation Record

## Purpose

`relevance-candidates-v1` is not a ground-truth dataset used directly to train
the relevance classifier. It is a candidate dataset that provides sentences for
human review in production `/annotate`.

The generated label is used only for the following flow.

```text
generated relevance
-> request_context.candidate_relevance
-> annotation queue routing and UI preselection
-> human review
-> annotations.relevance ground truth
```

## Composition

A total of 600 English sentences are generated.

| Candidate relevance | Count | Purpose |
| --- | ---: | --- |
| `contextual_preference` | 200 | preferences, diet, goals, household context |
| `domain_non_actionable` | 300 | hard negatives sharing grocery vocabulary |
| `unrelated` | 100 | easy outside-domain negatives |

`actionable` candidates are not regenerated here because they can already be
collected from `synthetic-v1` and real correction or confirmed queues. The
final four-class relevance-training data is built later by combining reviewed
results from this corpus with existing reviewed actionable annotation.

## Phrase Family

A total of 35 families are used.

- `contextual_preference`: 10 families, 20 each
- `domain_non_actionable`: 15 families, 20 each
- `unrelated`: 10 families, 10 each

Major hard-negative families:

```text
price_observation
past_meal_report
recipe_instruction_quote
store_availability_report
product_comparison
nutrition_observation
cooking_process_report
future_meal_speculation
restaurant_experience
food_trend
seasonality_observation
package_observation
food_memory
social_food_report
general_food_question
```

For example, `The recipe says to add ...` contains an action-like word such as
`add`, but the user is not asking Jangoing for an inventory action. So it is a
`domain_non_actionable` candidate. Making lexical shortcuts harder in this way
is more important than generating a large number of fully unrelated sentences.

## Files

```text
ml/data_generation/generate_relevance_candidates.py
ml/data_generation/relevance-scenarios-v1.json
ml/datasets/relevance-candidates-v1.jsonl
ml/manifests/relevance-candidates-v1.json
ml/tests/test_relevance_candidates.py
```

The generator uses seed `20260828`, the `grocery-v1` taxonomy, and the scenario
file. The same inputs produce JSONL payloads with the same SHA-256 hash.

## Automatic Validation

The generator and tests verify:

- exactly 600 records
- `200 / 300 / 100` by relevance class
- zero duplicate record IDs or normalized text
- 35 phrase families
- no phrase family crosses multiple relevance classes
- candidate records contain no `intent` or `actions`
- preference and domain candidates contain grocery aliases
- unrelated candidates do not contain grocery aliases
- manifest SHA-256 matches the actual dataset hash

`candidate_label_only: true` is an explicit marker to prevent anyone from
mistaking generated labels for human ground truth.

## Regeneration

```bash
cd /home/jjiwoo/.workspace/jangoing
python3 ml/data_generation/generate_relevance_candidates.py
```

Inside an ML virtual environment with pytest installed:

```bash
source ml/.venv/bin/activate
pytest ml/tests/test_relevance_candidates.py
```

## Production D1 Import

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run annotation:import-generated -- --remote \
  --input ml/datasets/relevance-candidates-v1.jsonl \
  --label relevance-candidates-v1
```

Running the same label again updates the same inference rows because the import
uses stable IDs. Reimporting the same dataset under a different label can
create duplicate unannotated candidates, so avoid that.

Expected queues after import:

- `Load preference/context`: 200 candidates
- `Load domain non-actionable`: 300 candidates
- `Load unrelated negative`: 100 candidates

Rows that were already annotated are excluded from queues, so the actual
available counts decrease as review progresses.

## Recommended Pilot

Do not review all 600 immediately. Start with these 120 first.

- contextual/preference: 40
- domain non-actionable: 60
- unrelated: 20

Check the following during the pilot:

- whether candidate relevance matches the real convention often enough
- which phrase families remain repeatedly ambiguous across classes
- whether item combinations feel unnatural or unrealistic
- whether the same template appears too obviously
- whether annotators are being overly anchored by the preselected candidate label

If problems appear, revise the scenario and generator and create a new dataset
version. Do not quietly overwrite already reviewed annotation with different
sentences.

## Reviewed Export

Only export relevance ground truth after human review.

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

The generated phrase family stored by the importer is exported as
`phrase_family` for reviewed records that have no actions. So if the same
template family leaks into both train and evaluation, leakage validation can
still detect it.

## Limits

- every sentence is generated from deterministic templates and does not reflect
  the real user distribution
- generated relevance is not the answer until a human reviews it
- grocery alias overlap is controlled, but finer lexical shortcuts are not
  fully eliminated
- the boundary between personal preference and simple food opinion can remain
  ambiguous for some sentences
- the final evaluation set should be built mainly from independent reviewed
  human utterances, not from this synthetic candidate corpus
