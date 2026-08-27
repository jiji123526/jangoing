import hashlib
import json
from collections import Counter
from pathlib import Path

REQUIRED_FIELDS = {"id", "text", "intent", "phrase_family"}


def load_jsonl(path: Path) -> list[dict]:
    records = []
    for line_number, line in enumerate(path.read_text().splitlines(), start=1):
        if not line.strip():
            continue
        record = json.loads(line)
        missing = REQUIRED_FIELDS - record.keys()
        if missing:
            raise ValueError(f"line {line_number}: missing {sorted(missing)}")
        records.append(record)
    if not records:
        raise ValueError("dataset is empty")
    counts = Counter(record["id"] for record in records)
    duplicates = [key for key, count in counts.items() if count > 1]
    if duplicates:
        raise ValueError(f"duplicate ids: {duplicates[:5]}")
    return records


def dataset_digest(records: list[dict]) -> str:
    payload = "\n".join(json.dumps(record, sort_keys=True) for record in records)
    return hashlib.sha256(payload.encode()).hexdigest()
