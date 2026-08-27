import argparse
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.pipeline import Pipeline

from jangoing_ml.data import dataset_digest, load_jsonl
from jangoing_ml.split import grouped_split


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, default=Path("ml/artifacts/baseline"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    records = load_jsonl(args.dataset)
    multi_action_count = sum(len(record.get("intents", [record.get("intent")])) > 1 for record in records)
    records = [
        record for record in records
        if len(record.get("intents", [record.get("intent")])) == 1 and record.get("intent")
    ]
    if not records:
        raise ValueError("single-intent baseline has no single-action records to train on")
    splits = grouped_split(records, args.seed)
    if len({record["intent"] for record in splits["train"]}) < 2:
        raise ValueError("training split needs at least two intent classes")
    model = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
            (
                "classifier",
                LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=args.seed,
                ),
            ),
        ]
    )
    model.fit(
        [record["text"] for record in splits["train"]],
        [record["intent"] for record in splits["train"]],
    )
    evaluation = splits["test"] or splits["validation"]
    if not evaluation:
        raise ValueError("dataset needs enough phrase families for an evaluation split")
    truth = [record["intent"] for record in evaluation]
    predictions = model.predict([record["text"] for record in evaluation]).tolist()
    labels = sorted({*truth, *predictions})
    metrics = classification_report(
        truth, predictions, labels=labels, output_dict=True, zero_division=0
    )
    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.output / "model.joblib")
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": "tfidf-logistic-regression",
        "dataset_sha256": dataset_digest(records),
        "seed": args.seed,
        "git_commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True
        ).stdout.strip(),
        "python": platform.python_version(),
        "split_counts": {key: len(value) for key, value in splits.items()},
        "excluded_multi_action_records": multi_action_count,
        "labels": labels,
        "metrics": metrics,
        "confusion_matrix": confusion_matrix(
            truth, predictions, labels=labels
        ).tolist(),
    }
    (args.output / "metrics.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metrics.get("macro avg", {}), indent=2))


if __name__ == "__main__":
    main()
