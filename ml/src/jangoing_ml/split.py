import random
from collections import defaultdict


def grouped_split(records: list[dict], seed: int = 42) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        groups[record["phrase_family"]].append(record)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    result = {"train": [], "validation": [], "test": []}
    for index, key in enumerate(keys):
        ratio = index / max(len(keys), 1)
        target = (
            "train" if ratio < 0.7 else "validation" if ratio < 0.85 else "test"
        )
        result[target].extend(groups[key])
    return result
