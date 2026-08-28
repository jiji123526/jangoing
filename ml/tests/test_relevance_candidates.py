import hashlib
import json
import re
from collections import Counter
from pathlib import Path


def test_relevance_candidates_v1_is_valid_and_candidate_only():
    ml_root = Path(__file__).parents[1]
    dataset_path = ml_root / "datasets/relevance-candidates-v1.jsonl"
    manifest_path = ml_root / "manifests/relevance-candidates-v1.json"
    taxonomy_path = ml_root / "taxonomy/grocery-v1.json"

    payload = dataset_path.read_text()
    records = [json.loads(line) for line in payload.splitlines()]
    manifest = json.loads(manifest_path.read_text())
    taxonomy = json.loads(taxonomy_path.read_text())

    assert len(records) == 600
    assert Counter(record["relevance"] for record in records) == {
        "contextual_preference": 200,
        "domain_non_actionable": 300,
        "unrelated": 100,
    }
    assert len({record["id"] for record in records}) == 600
    assert len({" ".join(record["text"].lower().split()) for record in records}) == 600
    assert len({record["phrase_family"] for record in records}) == 35
    assert {record["language"] for record in records} == {"en"}
    assert {record["locale"] for record in records} == {"en-US"}
    assert all(record["candidate_label_only"] is True for record in records)
    assert all("intent" not in record and "actions" not in record for record in records)

    family_classes = {}
    for record in records:
        existing = family_classes.setdefault(record["phrase_family"], record["relevance"])
        assert existing == record["relevance"]

    aliases = {
        alias.lower()
        for section in ("products", "categories")
        for entry in taxonomy[section]
        for alias in entry["aliases"]["en"]
    }
    alias_pattern = re.compile(
        rf"(?<![a-z])(?:{'|'.join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))})(?![a-z])"
    )
    for record in records:
        has_grocery_alias = bool(alias_pattern.search(record["text"].lower()))
        if record["relevance"] == "unrelated":
            assert not has_grocery_alias
        else:
            assert has_grocery_alias

    assert manifest["dataset_sha256"] == hashlib.sha256(payload.encode()).hexdigest()
    assert manifest["record_count"] == 600
    assert manifest["phrase_family_count"] == 35
