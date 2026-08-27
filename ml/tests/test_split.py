from jangoing_ml.split import grouped_split


def test_phrase_families_do_not_cross_splits():
    records = [
        {
            "id": str(index),
            "text": f"text {index}",
            "intent": "x",
            "phrase_family": f"group-{index // 2}",
        }
        for index in range(20)
    ]
    splits = grouped_split(records)
    ownership = {}
    for split, items in splits.items():
        for item in items:
            previous = ownership.setdefault(item["phrase_family"], split)
            assert previous == split
