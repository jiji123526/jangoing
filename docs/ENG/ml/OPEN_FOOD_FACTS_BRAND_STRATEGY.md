# Open Food Facts Brand and Product Normalization Strategy

Last updated: 2026-08-28

## Purpose

This document records how
[the Open Food Facts product database](https://huggingface.co/datasets/openfoodfacts/product-database)
can be used in Jangoing and how brand/product-name normalization should be
expanded structurally.

The core decision is:

> Open Food Facts is used not as intent-utterance training data, but as an
> external knowledge source for building a product catalog and entity-linking candidates.

One Open Food Facts row typically represents a real packaged product. By
contrast, the data needed by the Jangoing intent model is user utterances such
as `We're out of Coke` plus action labels. So Open Food Facts alone cannot be
used to train intents like `mark_out`, `add_to_buy`, or `query_inventory`.

## Information That Can Be Used

The exact fields should always be checked against the real dataset version
before import, but the following kinds of information are useful:

- barcode or source product code
- product name and generic name
- brand
- category and category tags
- sale country and language
- package quantity
- ingredient or allergen metadata
- original record provenance

In Jangoing, this can support:

1. discovering new canonical item candidates
2. collecting brand and product-name aliases
3. building item-category relations
4. retrieving entity-linking candidates
5. building evaluation sets for unseen aliases and unknown products

It should not be used directly for:

- ground-truth intent labels
- natural household command sentences
- ground-truth relevance classes
- direct production canonical vocabulary without review

## Normalization That Preserves Mention Granularity

Annotators and entity models preserve the specificity actually spoken by the user.

```text
"soda"      -> CATEGORY: soda
"Coke"      -> ITEM: coca_cola
"Sprite"    -> ITEM: sprite
"Coke Zero" -> ITEM: coca_cola_zero_sugar
```

Do not arbitrarily specialize `soda` into `coca_cola`, and do not collapse
`Coke Zero` down into `soda`. The task of linking to household inventory should
happen after annotation, in the entity-linking stage.

The MVP does not add a separate `BRAND` entity yet. When a brand is spoken as
part of a product mention, label the full mention as one `ITEM` span:

```text
"We're out of Coke Zero"
                 ^^^^^^^^^ ITEM -> coca_cola_zero_sugar
```

Add a dedicated `BRAND` label only if a real product function later needs to
constrain by the brand itself, such as `any soda made by Coca-Cola`. Adding it
too early only increases annotation and model complexity without a concrete
action use case.

## Proposed `grocery-v2` Catalog Structure

The current `ml/taxonomy/grocery-v1.json` is a small synthetic taxonomy and
cannot fully represent product family, brand, variant, and provenance. The next
version should separate conceptual identity from external source records.

```json
{
  "id": "coca_cola_zero_sugar",
  "display_name": "Coca-Cola Zero Sugar",
  "product_family_id": "cola",
  "brand_id": "coca_cola",
  "category_id": "soda",
  "aliases": {
    "en": ["Coke Zero", "Coca-Cola Zero", "Coca-Cola Zero Sugar"]
  },
  "source_records": [
    {
      "source": "open_food_facts",
      "source_id": "source-product-code"
    }
  ],
  "status": "active"
}
```

Separate concepts that are needed:

- `category`: upper-level grouping such as `beverage`, `soda`, `dairy`
- `product_family`: product family like `cola`, `milk`, `cracker`
- `brand`: manufacturer/trademark concept such as `coca_cola`
- `item`: normalized entities such as `coca_cola_zero_sugar`, `whole_milk`
- `alias`: surface forms users may say
- `source_record`: original ID and provenance from an external dataset
- `status`: lifecycle support for canonical merges and deprecation

Do not create a separate canonical item for every barcode-level package-size row.
Many Open Food Facts rows can point to the same Jangoing item. If package size
later matters for inventory behavior, represent it as a separate package variant
rather than item identity.

## Separate Entity Extraction from Entity Linking

Recommended runtime flow:

```text
entity model detects ITEM span
-> catalog exact alias candidate lookup
-> normalized alias / fuzzy / context ranking
-> canonical item or category selection
-> ask the user when confidence is low or there are multiple candidates
```

For example, if the household inventory contains only `whole_milk` but the user
says `milk`, the annotation answer remains `milk`. The linker may propose
`whole_milk` from household context, but it must not auto-promote unless it
passes confidence and ambiguity policy.

The first baseline should use this order rather than a complex embedding model:

1. exact alias match after cleaning case/punctuation/spacing
2. token-normalized match against canonical IDs and aliases
3. limited fuzzy match
4. ranking using household inventory and category information
5. `needs_clarification` below threshold

This structure allows span-model errors and catalog-linking errors to be
evaluated separately.

## Import Strategy

Do not import the entire Open Food Facts database directly into D1 or the
taxonomy. It is large and may contain duplication, multilingual variation,
incomplete records, and package variants.

### Step 1: Verify Schema and Usage Conditions

- check the current field schema in the Hugging Face dataset card and official Open Food Facts docs
- verify current database license, attribution, and share-alike obligations
- if images are needed, verify image licensing separately from database licensing
- check support for streaming or filtered download
- decide how attribution is handled in the repository and deployed UI

License conditions may change, so this document is not a substitute for legal review.

### Step 2: Build a Small English Subset

- keep only food/beverage records with English names
- drop low-quality rows missing name, brand, category, or source ID
- begin with only 100–500 frequent product concepts
- keep raw snapshot and transformed output separate
- record dataset revision, filter version, run date, and hash

Recommended paths:

```text
ml/data/external/open_food_facts/raw/
ml/data/external/open_food_facts/filtered/
ml/data/external/open_food_facts/manifests/
```

### Step 3: Canonical Review

- merge exact duplicates plus punctuation/case aliases
- collapse barcode/package variants into product concepts
- check conflicts with existing `grocery-v1`
- human-review category mappings
- record canonical merges and deprecated-ID redirects

External records do not automatically enter the production normalized-value
list. Filtered results are only candidates; only human-approved catalog
concepts become `active`.

### Step 4: Connect the Linker and Annotation

- use the taxonomy/catalog as the single source of truth for normalized values
- support canonical item and alias search in the annotation dropdown
- keep unknown items as new normalized-value candidates just as today
- later enrich those new values during catalog curation with brand, family,
  category, and provenance

Do not discard the normalized values that already grew automatically from the
annotation DB. When catalog migration happens, import them as candidates with
`source = reviewed_annotation` provenance.

### Step 5: Brand-Aware Candidate Generation

Use aliases from the approved catalog to create action templates for annotation candidates.

```text
We're out of Coke Zero.       -> mark_out
Add Sprite to the list.       -> add_to_buy
Do we have any cola?          -> query_inventory
```

These are still synthetic candidates. They are not training or evaluation
truth until a human reviews them.

## Evaluation Design

If the whole catalog is split randomly, aliases of the same product or nearly
identical package records can leak across train and test. At minimum, separate
these slices:

- `seen_product_seen_alias`: product and expression both seen in training
- `seen_product_unseen_alias`: same product, new expression
- `unseen_product_known_family`: new product, known product family
- `catalog_unknown`: real user item absent from catalog
- `generic_vs_specific`: distinguish cases such as `milk` vs `whole milk`,
  `soda` vs `Coke`
- `ambiguous_household_match`: one generic mention with multiple inventory candidates

Metrics to report:

- entity span exact match
- canonical item linking accuracy
- top-k candidate recall
- category accuracy
- clarification precision/recall
- catalog coverage and unknown rate
- performance by source and by brand popularity

A popular-brand-heavy external catalog can create frequency bias. Report
long-tail and unseen-product performance separately rather than relying only on
aggregate accuracy.

## Problems to Resolve in the Current Taxonomy

The following mismatches need to be cleaned up before implementation:

- current `soda` is represented under `beverage`, but with brand expansion it
  is more appropriate as a category or product-family concept
- current `whole milk` is treated as a `milk` alias, but the annotation
  convention now requires a specific item `whole_milk`
- there is no `brand_id`, `product_family_id`, variant, or provenance field
- there is no rule for canonical merge or deprecated-ID redirect
- hardcoded normalized values in `packages/contracts/src/index.ts` can become a
  duplicate knowledge source and drift away from the taxonomy

So before Open Food Facts import, `grocery-v2` schema and migration rules should
be defined first.

## Build Order

1. write the `grocery-v2` schema and JSON Schema
2. define category, product family, brand, item, alias, and provenance relations
3. write migration tables for existing conflicts such as `soda`, `milk`, `whole_milk`
4. decide the API boundary that makes taxonomy the single source of truth for normalized values
5. build a filtered Open Food Facts importer for 100–500 concepts
6. build a human-curation report and canonical-merge tooling
7. implement the exact-alias linker baseline
8. generate brand-aware review candidates
9. implement leakage-safe evaluation splits and catalog metrics
10. compare fuzzy or embedding-based linkers only after real error evidence exists

## Current Decision

- Open Food Facts usage: **conditionally adopted**
- role: product catalog, alias, category, and provenance source
- role as intent/relevance training data: **not adopted**
- full-database production import: **not adopted**
- initial scope: curated English subset of 100–500 product concepts
- branded mention annotation: full `ITEM` span
- separate `BRAND` entity: postponed until product features require it
- prerequisite for implementation: recheck `grocery-v2` schema plus current
  license/schema conditions
