import json
from collections import Counter
from pathlib import Path


def test_synthetic_v1_is_balanced_unique_and_span_valid():
    path = Path(__file__).parents[1] / "datasets/synthetic-v1.jsonl"
    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert len(records) == 800
    assert len({record["text"].lower() for record in records}) == 800
    assert set(Counter(record["intent"] for record in records).values()) == {100}
    assert {record["language"] for record in records} == {"en"}
    assert {record["locale"] for record in records} == {"en-US"}
    for record in records:
        for entity in record["entities"]:
            assert record["text"][entity["start"] : entity["end"]] == entity["text"]

    item_names = {
        record["normalized"]["item_name"]
        for record in records
        if "item_name" in record["normalized"]
    }
    assert len(item_names) >= 20
    assert {"oat_milk", "spinach", "chicken", "pasta", "tea"} <= item_names
