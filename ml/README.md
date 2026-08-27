# jangoing ML quick start

The first model is a CPU-friendly TF-IDF + logistic-regression intent baseline.

Generate the reproducible 800-record English bootstrap dataset:

```bash
python ml/data_generation/generate_synthetic.py
```

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
npm run dataset:export -- --output ml/data/reviewed.jsonl
python ml/train_baseline.py ml/data/reviewed.jsonl
pytest ml/tests
```

Training requires reviewed examples from at least two intents. Generated data and
artifacts are local-only; commit code and manifests, not conversational data.

The committed `ml/datasets/synthetic-v1.jsonl` is safe synthetic bootstrap data,
not production conversation data and not a valid final human test set. Its design
and limitations are recorded in `SYNTHETIC_V1_KO.md`.

To export reviewed production interactions from Cloudflare D1 instead:

```bash
npm run dataset:export -- --remote --output ml/data/reviewed.jsonl
```
