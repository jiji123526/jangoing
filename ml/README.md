# jangoing ML quick start

The first model is a CPU-friendly TF-IDF + logistic-regression single-intent baseline.
The authoritative reviewed-corpus targets and split policy are documented in
[Text Dataset Design v1](../docs/ENG/ml/TEXT_DATASET_DESIGN_V1.md).

Generate the reproducible 800-record English bootstrap dataset:

```bash
python ml/data_generation/generate_synthetic.py
```

Generate the 600-record non-actionable relevance review candidates:

```bash
python3 ml/data_generation/generate_relevance_candidates.py
```

This produces 200 contextual/preference candidates, 300 domain-adjacent hard
negatives, and 100 unrelated negatives across 35 phrase families. These are
annotation candidates, not training labels. Import them to production D1 and
human-review them before using `--task relevance`:

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/relevance-candidates-v1.jsonl \
  --label relevance-candidates-v1
```

See [the English candidate dataset record](../docs/ENG/annotation/RELEVANCE_CANDIDATES_V1.md).

The current `synthetic-v1` keeps the same 800 balanced records but now draws
from a broader 34-item grocery taxonomy and rotates English aliases for more
surface variation. Condition-like modifiers such as `ripe` and `fresh` are no
longer embedded inside item aliases, so synthetic ITEM spans stay aligned with
the annotation rule that temporary states should be labeled separately as
`ITEM_CONDITION`. The generator still does not emit comprehensive
`ITEM_CONDITION` span labels by itself, so use reviewed annotation rather than
raw synthetic data for condition-sensitive slot training.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
pytest ml/tests
```

After reviewed human data exists:

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
```

For span-supervised experiments:

```bash
npm run dataset:export -- --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

For the utterance-level relevance classifier:

```bash
npm run dataset:export -- --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

The relevance task requires reviewed annotations and preserves
`actionable`, `contextual_preference`, `domain_non_actionable`, and `unrelated`.
The intent, slots, and joint tasks exclude non-actionable records.

Training requires reviewed examples from at least two intents. Generated data and
artifacts are local-only; commit code and manifests, not conversational data.

`annotation-v3` exports contain utterance-level `relevance`, `intents`, and
structured `actions`. A one-action record also receives the legacy `intent`,
`slots`, and `entities` fields. Non-actionable records have empty action lists.
The current intent baseline excludes multi-action records instead of assigning
only their first intent, and records `excluded_multi_action_records` in
`metrics.json`.

Recommended sequence:

1. Train the bootstrap baseline on `ml/datasets/synthetic-v1.jsonl`.
2. Collect 100–200 human training candidates in `/annotate`.
3. Collect 100+ independent human evaluation candidates.
4. Review duplicates and phrase-family leakage before freezing a test set.
5. Mix reviewed training data with synthetic data and compare runs by dataset hash.

The committed `ml/datasets/synthetic-v1.jsonl` is safe synthetic bootstrap data,
not production conversation data and not a valid final human test set. Its design
and limitations are recorded in
[the synthetic dataset record](../docs/ENG/ml/SYNTHETIC_V1.md).

To export reviewed production interactions from Cloudflare D1 instead:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```
