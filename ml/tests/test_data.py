import json

from jangoing_ml.data import load_jsonl


def test_load_jsonl_accepts_multi_action_records(tmp_path):
    dataset = tmp_path / "multi.jsonl"
    dataset.write_text(
        json.dumps(
            {
                "id": "multi-1",
                "text": "Add milk and throw away spinach",
                "intents": ["add_to_buy", "throw_away"],
                "actions": [
                    {"intent": "add_to_buy", "entities": []},
                    {"intent": "throw_away", "entities": []},
                ],
                "phrase_family": "multi:explicit_add_to_list+explicit_discard_request",
            }
        )
        + "\n"
    )

    assert load_jsonl(dataset)[0]["intents"] == ["add_to_buy", "throw_away"]
