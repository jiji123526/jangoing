import argparse
import hashlib
import json
import random
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

GENERATOR_VERSION = "relevance-candidates-v1"
SEED = 20260828
CLASS_TARGETS = {
    "contextual_preference": 200,
    "domain_non_actionable": 300,
    "unrelated": 100,
}

GLOBAL_VALUES = {
    "household_member": [
        "My partner", "My roommate", "My kids", "My sister", "My brother",
        "My mother", "My father", "My spouse", "Our oldest child", "My cousin",
    ],
    "meal": [
        "breakfast", "lunch", "dinner", "an afternoon snack", "a late breakfast",
        "weekend brunch", "a quick lunch", "a light dinner", "a morning snack", "supper",
    ],
    "dish": [
        "pasta sauce", "breakfast bowl", "sandwich", "soup", "smoothie",
        "stir-fry", "salad", "casserole", "tacos", "grain bowl",
    ],
    "store": [
        "the supermarket", "the neighborhood market", "the corner store",
        "the warehouse store", "the grocery store", "the weekend market",
        "the organic market", "the local co-op", "the discount market", "the food hall",
    ],
    "quality": [
        "creamy", "light", "firm", "smooth", "crisp",
        "soft", "rich", "mild", "chewy", "dense",
    ],
    "serving_style": [
        "cold", "warm", "plain", "lightly toasted", "well chilled",
        "finely chopped", "thinly sliced", "gently heated", "mixed in", "served separately",
    ],
    "cooking_method": [
        "roasting", "baking", "grilling", "steaming", "sauteing",
        "simmering", "toasting", "blending", "warming", "chopping",
    ],
    "season": [
        "spring", "early summer", "late summer", "fall", "winter",
        "the holiday season", "the rainy season", "cool weather", "warm weather", "harvest season",
    ],
    "place": [
        "Seattle", "Chicago", "Boston", "Austin", "Portland",
        "Denver", "Atlanta", "San Diego", "New York", "the coast",
    ],
    "weather": [
        "cloudy", "windy", "rainy", "sunny", "humid",
        "foggy", "cold", "warm", "stormy", "dry",
    ],
    "transport": [
        "train", "bus", "subway", "commuter rail", "airport shuttle",
        "ferry", "streetcar", "school bus", "express bus", "morning flight",
    ],
    "work_item": [
        "project review", "planning meeting", "design document", "client call", "budget meeting",
        "status report", "training session", "team workshop", "presentation", "interview",
    ],
    "entertainment": [
        "documentary", "comedy", "mystery film", "science-fiction series", "concert recording",
        "historical drama", "game show", "travel program", "short film", "crime series",
    ],
    "device": [
        "laptop", "phone", "tablet", "printer", "router",
        "smartwatch", "television", "camera", "speaker", "desktop computer",
    ],
    "sport": [
        "baseball", "basketball", "soccer", "hockey", "tennis",
        "volleyball", "football", "rugby", "cricket", "lacrosse",
    ],
    "home_item": [
        "garage door", "bathroom faucet", "heater", "front window", "roof",
        "washing machine", "doorbell", "air conditioner", "porch light", "hallway floor",
    ],
    "finance_item": [
        "bank statement", "insurance notice", "utility bill", "tax document", "credit report",
        "rent receipt", "loan statement", "account summary", "payment reminder", "renewal notice",
    ],
}


def load_json(path: Path):
    return json.loads(path.read_text())


def stable_offset(value: str) -> int:
    return int(hashlib.sha256(value.encode()).hexdigest()[:8], 16)


def pick(sequence, position: int, offset: int = 0):
    return sequence[(position + offset) % len(sequence)]


def alias_for(product: dict, position: int, offset: int = 0) -> str:
    aliases = product["aliases"]["en"]
    return pick(aliases, position, offset)


def global_render_values(
    products: list[dict],
    categories: list[dict],
    position: int,
    offset: int,
) -> dict[str, str]:
    product_index = (position * 6 + offset) % len(products)
    other_index = (product_index + 11 + position) % len(products)
    if other_index == product_index:
        other_index = (other_index + 1) % len(products)
    product = products[product_index]
    same_category = [
        candidate
        for candidate in products
        if candidate["category_id"] == product["category_id"]
        and candidate["id"] != product["id"]
    ]
    other_product = (
        pick(same_category, position, offset // 3)
        if same_category
        else products[other_index]
    )
    cooking_products = [
        candidate
        for candidate in products
        if candidate["id"] in {
            "milk", "egg", "yogurt", "oat_milk", "cheese", "butter", "apple",
            "banana", "blueberry", "frozen_blueberry", "grape", "strawberry",
            "tomato", "spinach", "lettuce", "bread", "rice", "pasta", "oatmeal",
            "chicken", "tofu", "salmon", "peanut_butter",
        }
    ]
    meal_products = [
        candidate
        for candidate in products
        if candidate["id"] in {
            "egg", "yogurt", "cheese", "apple", "banana", "blueberry",
            "frozen_blueberry", "grape", "strawberry", "tomato", "spinach",
            "lettuce", "bread", "rice", "pasta", "cereal", "oatmeal", "chicken",
            "tofu", "salmon", "juice", "orange_juice", "chips", "crackers",
            "cookies", "ice_cream",
        }
    ]
    produce_products = [
        candidate
        for candidate in products
        if candidate["category_id"] in {"produce", "greens"}
    ]
    produce_aliases = [
        alias
        for candidate in produce_products
        for alias in candidate["aliases"]["en"]
    ]
    cooking_product = pick(cooking_products, position * 7, offset // 7)
    meal_product = pick(meal_products, position * 7, offset // 11)
    category_aliases = [
        alias
        for category in categories
        for alias in category["aliases"]["en"]
    ]
    values = {
        "item": alias_for(product, position, offset),
        "other_item": alias_for(other_product, position, offset // 3),
        "cooking_item": alias_for(cooking_product, position, offset // 7),
        "meal_item": alias_for(meal_product, position, offset // 11),
        "produce_item": pick(produce_aliases, position // 2, offset // 13),
        "category": pick(category_aliases, position * 3, offset),
    }
    for key, choices in GLOBAL_VALUES.items():
        values[key] = pick(choices, position * 3, offset // 5)
    return values


def render(template: str, values: dict[str, str]) -> str:
    text = template.format_map(values)
    if "{" in text or "}" in text:
        raise ValueError(f"unresolved placeholder in template: {template}")
    return text


def grocery_alias_pattern(taxonomy: dict) -> re.Pattern:
    aliases = []
    for section in ("products", "categories"):
        for entry in taxonomy[section]:
            aliases.extend(entry["aliases"]["en"])
    alternatives = "|".join(
        re.escape(alias.lower())
        for alias in sorted(set(aliases), key=len, reverse=True)
    )
    return re.compile(rf"(?<![a-z])(?:{alternatives})(?![a-z])")


def validate(records: list[dict], taxonomy: dict) -> tuple[Counter, Counter, Counter]:
    errors = []
    expected_count = sum(CLASS_TARGETS.values())
    if len(records) != expected_count:
        errors.append(f"expected {expected_count} records, got {len(records)}")

    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        errors.append("duplicate record id detected")

    normalized_texts = [" ".join(record["text"].lower().split()) for record in records]
    if len(normalized_texts) != len(set(normalized_texts)):
        duplicates = [
            text for text, count in Counter(normalized_texts).items() if count > 1
        ]
        errors.append(f"duplicate text detected: {duplicates[:5]}")

    relevance_counts = Counter(record["relevance"] for record in records)
    if relevance_counts != Counter(CLASS_TARGETS):
        errors.append(f"unexpected relevance counts: {dict(relevance_counts)}")

    family_counts = Counter(record["phrase_family"] for record in records)
    family_classes = {}
    for record in records:
        existing = family_classes.setdefault(record["phrase_family"], record["relevance"])
        if existing != record["relevance"]:
            errors.append(f"phrase family crosses relevance classes: {record['phrase_family']}")
        if "intent" in record or "actions" in record:
            errors.append(f"candidate record contains ground-truth action fields: {record['id']}")

    alias_pattern = grocery_alias_pattern(taxonomy)
    grocery_counts = Counter()
    for record in records:
        has_grocery_alias = bool(alias_pattern.search(record["text"].lower()))
        if has_grocery_alias:
            grocery_counts[record["relevance"]] += 1
        if record["relevance"] in {"contextual_preference", "domain_non_actionable"}:
            if not has_grocery_alias:
                errors.append(f"domain candidate has no grocery alias: {record['id']}")
        elif has_grocery_alias:
            errors.append(f"unrelated candidate contains grocery alias: {record['id']}")

    if errors:
        raise ValueError("; ".join(errors[:10]))
    return relevance_counts, family_counts, grocery_counts


def build_records(taxonomy: dict, scenarios: dict) -> list[dict]:
    products = taxonomy["products"]
    categories = taxonomy["categories"]
    records = []

    for relevance, target in CLASS_TARGETS.items():
        families = scenarios["classes"][relevance]
        if target % len(families) != 0:
            raise ValueError(f"{relevance} target must divide evenly across phrase families")
        records_per_family = target // len(families)

        for family in families:
            family_id = f"{relevance}:{family['id']}"
            offset = stable_offset(family_id)
            for variant in range(records_per_family):
                template = family["templates"][variant % len(family["templates"])]
                values = global_render_values(products, categories, variant, offset)
                text = render(template, values)
                records.append({
                    "id": f"relevance-v1-{len(records) + 1:04d}",
                    "text": text,
                    "language": "en",
                    "locale": "en-US",
                    "relevance": relevance,
                    "phrase_family": family_id,
                    "difficulty": (
                        "hard" if relevance == "domain_non_actionable"
                        else "medium" if relevance == "contextual_preference"
                        else "easy"
                    ),
                    "source": "synthetic-relevance-candidate",
                    "generator_version": GENERATOR_VERSION,
                    "scenario_version": scenarios["version"],
                    "taxonomy_version": taxonomy["version"],
                    "candidate_label_only": True,
                    "tags": (
                        ["relevance", "hard_negative", "grocery_domain"]
                        if relevance == "domain_non_actionable"
                        else ["relevance", "context_candidate", "grocery_domain"]
                        if relevance == "contextual_preference"
                        else ["relevance", "outside_domain"]
                    ),
                })

    random.Random(SEED).shuffle(records)
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("ml/datasets/relevance-candidates-v1.jsonl"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("ml/manifests/relevance-candidates-v1.json"),
    )
    args = parser.parse_args()

    base = Path(__file__).resolve().parent
    taxonomy = load_json(base.parent / "taxonomy/grocery-v1.json")
    scenarios = load_json(base / "relevance-scenarios-v1.json")
    records = build_records(taxonomy, scenarios)
    relevance_counts, family_counts, grocery_counts = validate(records, taxonomy)

    payload = "\n".join(
        json.dumps(record, ensure_ascii=False, sort_keys=True)
        for record in records
    ) + "\n"
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
        "relevance_counts": dict(sorted(relevance_counts.items())),
        "phrase_family_count": len(family_counts),
        "phrase_family_counts": dict(sorted(family_counts.items())),
        "grocery_mention_counts": dict(sorted(grocery_counts.items())),
        "dataset_sha256": digest,
        "taxonomy_version": taxonomy["version"],
        "scenario_version": scenarios["version"],
        "scenario_file": "ml/data_generation/relevance-scenarios-v1.json",
        "generator_file": "ml/data_generation/generate_relevance_candidates.py",
        "validation": {
            "duplicate_ids": 0,
            "duplicate_texts": 0,
            "candidate_labels_only": True,
            "phrase_families_cross_classes": 0,
            "domain_records_have_grocery_alias": True,
            "unrelated_records_have_no_grocery_alias": True,
        },
        "usage": (
            "annotation candidates only; generated relevance is routing metadata, "
            "not training ground truth"
        ),
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
