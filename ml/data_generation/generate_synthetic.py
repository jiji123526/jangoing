import argparse
import hashlib
import json
import random
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

GENERATOR_VERSION = "synthetic-v1"
SEED = 20260826
EXPECTED_INTENTS = {
    "add_item", "consume_item", "mark_low", "throw_away", "add_to_buy",
    "query_inventory", "unknown", "needs_clarification",
}


def load_json(path: Path):
    return json.loads(path.read_text())


def render(template, values):
    text = template
    entities = []
    normalized = {}
    remaining = dict(values)
    while True:
        candidates = [
            (text.index("{" + placeholder + "}"), placeholder)
            for placeholder in remaining
            if "{" + placeholder + "}" in text
        ]
        if not candidates:
            break
        start, placeholder = min(candidates)
        value = remaining.pop(placeholder)
        token = "{" + placeholder + "}"
        surface, label, normalized_key, normalized_value = value
        text = text.replace(token, surface, 1)
        entities.append({"label": label, "start": start, "end": start + len(surface), "text": surface})
        if normalized_key:
            normalized[normalized_key] = normalized_value
    entities.sort(key=lambda entity: entity["start"])
    return text, entities, normalized


def validate(records, expected_count=800):
    errors = []
    if len(records) != expected_count:
        errors.append(f"expected {expected_count} records, got {len(records)}")
    texts = [record["text"].lower() for record in records]
    if len(texts) != len(set(texts)):
        duplicates = [text for text, count in Counter(texts).items() if count > 1]
        errors.append(f"duplicate text detected: {duplicates[:5]}")
    counts = Counter(record["intent"] for record in records)
    if set(counts) != EXPECTED_INTENTS or any(count != 100 for count in counts.values()):
        errors.append(f"intent counts are not balanced: {dict(counts)}")
    for record in records:
        for entity in record["entities"]:
            actual = record["text"][entity["start"]:entity["end"]]
            if actual != entity["text"]:
                errors.append(f"span mismatch in {record['id']}: {entity}")
    if errors:
        raise ValueError("; ".join(errors[:10]))
    return counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("ml/datasets/synthetic-v1.jsonl"))
    parser.add_argument("--manifest", type=Path, default=Path("ml/manifests/synthetic-v1.json"))
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    taxonomy = load_json(base.parent / "taxonomy/grocery-v1.json")
    scenarios = load_json(base / "scenarios-v1.json")
    rng = random.Random(SEED)
    products = taxonomy["products"]
    categories = taxonomy["categories"]
    quantities = [("one", 1), ("two", 2), ("three", 3), ("four", 4), ("five", 5)]
    units = ["bottle", "carton", "bag", "pack", "piece"]
    topics = ["cooking", "coffee", "breakfast", "restaurants", "recipes", "gardening", "music", "travel", "movies", "weekends"]
    discourse_prefixes = [
        "", "Actually, ", "I think ", "It looks like ", "Before shopping, ",
        "For tomorrow, ", "Just a reminder, ", "When you can, ", "Please, ",
        "By the way, ",
    ]
    records = []
    for intent, templates in scenarios.items():
        for template_index, template in enumerate(templates):
            for variant in range(10):
                product = products[(variant + template_index) % len(products)]
                category = categories[(variant + template_index) % len(categories)]
                quantity_surface, quantity_value = quantities[(variant + template_index) % len(quantities)]
                unit = units[(variant * 2 + template_index) % len(units)]
                values = {
                    "item": (product["aliases"]["en"][0], "ITEM", "item_name", product["id"]),
                    "category": (category["aliases"]["en"][0], "CATEGORY", "category", category["id"]),
                    "quantity": (quantity_surface, "QUANTITY", "quantity", quantity_value),
                    "unit": (unit, "UNIT", "unit", unit),
                    "topic": (topics[(variant + template_index) % len(topics)], None, None, None),
                }
                effective_template = template
                if not any(token in template for token in values):
                    prefix = discourse_prefixes[variant]
                    effective_template = (
                        template if not prefix else prefix + template[0].lower() + template[1:]
                    )
                text, entities, normalized = render(effective_template, values)
                entities = [entity for entity in entities if entity["label"]]
                record_id = f"synthetic-v1-{len(records) + 1:04d}"
                records.append({
                    "id": record_id,
                    "text": text,
                    "language": "en",
                    "locale": "en-US",
                    "intent": intent,
                    "entities": entities,
                    "normalized": normalized,
                    "phrase_family": f"{intent}:template-{template_index + 1:02d}",
                    "difficulty": "hard" if intent == "needs_clarification" else "medium" if template_index >= 5 else "easy",
                    "requires_clarification": intent == "needs_clarification",
                    "source": "synthetic",
                    "generator_version": GENERATOR_VERSION,
                    "taxonomy_version": taxonomy["version"],
                    "tags": ["category"] if "{category}" in template else ["item"] if "{item}" in template else ["no_entity"],
                })
    rng.shuffle(records)
    counts = validate(records)
    payload = "\n".join(json.dumps(record, ensure_ascii=False, sort_keys=True) for record in records) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload)
    digest = hashlib.sha256(payload.encode()).hexdigest()
    manifest = {
        "dataset_version": GENERATOR_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "language": "en",
        "locale": "en-US",
        "seed": SEED,
        "record_count": len(records),
        "intent_counts": dict(sorted(counts.items())),
        "dataset_sha256": digest,
        "taxonomy_version": taxonomy["version"],
        "scenario_file": "ml/data_generation/scenarios-v1.json",
        "generator_file": "ml/data_generation/generate_synthetic.py",
        "validation": {"duplicates": 0, "span_errors": 0, "balanced_intents": True},
        "usage": "training bootstrap only; never use as the final human test set",
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
