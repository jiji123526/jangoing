from jangoing_ml.split import grouped_split


def test_phrase_families_do_not_cross_splits():
    records = [
        {
            "id": str(index),
            "text": f"text {index}",
            "intent": "x" if index < 20 else "y",
            "phrase_family": f"group-{index // 2}",
        }
        for index in range(40)
    ]
    splits = grouped_split(records)
    ownership = {}
    for split, items in splits.items():
        for item in items:
            previous = ownership.setdefault(item["phrase_family"], split)
            assert previous == split

    for split in splits.values():
        assert {item["intent"] for item in split} == {"x", "y"}
