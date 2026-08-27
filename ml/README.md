# jangoing ML quick start

The first model is a CPU-friendly TF-IDF + logistic-regression single-intent baseline.

Generate the reproducible 800-record English bootstrap dataset:

```bash
python ml/data_generation/generate_synthetic.py
```

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

Training requires reviewed examples from at least two intents. Generated data and
artifacts are local-only; commit code and manifests, not conversational data.

`annotation-v2` exports contain `intents` and structured `actions`. A one-action
record also receives the legacy `intent`, `slots`, and `entities` fields. The
current baseline excludes multi-action records instead of assigning only their
first intent, and records `excluded_multi_action_records` in `metrics.json`.

Recommended sequence:

1. Train the bootstrap baseline on `ml/datasets/synthetic-v1.jsonl`.
2. Collect 100–200 human training candidates in `/annotate`.
3. Collect 100+ independent human evaluation candidates.
4. Review duplicates and phrase-family leakage before freezing a test set.
5. Mix reviewed training data with synthetic data and compare runs by dataset hash.

The committed `ml/datasets/synthetic-v1.jsonl` is safe synthetic bootstrap data,
not production conversation data and not a valid final human test set. Its design
and limitations are recorded in `SYNTHETIC_V1_KO.md`.

To export reviewed production interactions from Cloudflare D1 instead:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```
