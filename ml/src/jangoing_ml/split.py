import random
from collections import defaultdict


def grouped_split(records: list[dict], seed: int = 42) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        groups[record["phrase_family"]].append(record)
    result = {"train": [], "validation": [], "test": []}
    keys_by_intent: dict[str, list[str]] = defaultdict(list)
    for key, items in groups.items():
        intents = {item["intent"] for item in items}
        if len(intents) != 1:
            raise ValueError(f"phrase family {key} contains multiple intents")
        keys_by_intent[next(iter(intents))].append(key)
    for intent, keys in sorted(keys_by_intent.items()):
        keys.sort()
        random.Random(f"{seed}:{intent}").shuffle(keys)
        for index, key in enumerate(keys):
            ratio = index / max(len(keys), 1)
            target = (
                "train" if ratio < 0.7 else "validation" if ratio < 0.85 else "test"
            )
            result[target].extend(groups[key])
    return result
