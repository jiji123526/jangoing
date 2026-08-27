# jangoing ML quick start

The first model is a CPU-friendly TF-IDF + logistic-regression intent baseline.

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
