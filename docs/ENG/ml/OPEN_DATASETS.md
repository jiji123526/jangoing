# Open Dataset Survey and Adoption Plan

## Purpose

This document surveys public datasets that may be useful for Jangoing's English
NLU, annotation, and model bootstrap. The goal is not simply to “pull in a lot
of data,” but to distinguish clearly what each dataset should be used for and
how directly it can map into the Jangoing schema.

The main conclusion is:

- there are almost no public datasets that match
  `fridge inventory + grocery note + voice command` exactly
- so the realistic approach is a combination of
  **general assistant NLU dataset + grocery domain dataset + in-house annotation**
- final model quality will still be determined by Jangoing production annotation
  itself; public datasets are mainly for bootstrap, vocabulary expansion, and
  improving out-of-domain awareness

## Priority Summary

### P0: Review Immediately

- `AmazonScience/massive`
- `benayas/snips`
- `empathyai/grocery-ner-dataset`
- `AmirMohseni/GroceryList`

### P1: Review in the Next Stage

- `pfb30/multi_woz_v22`
- `FunDialogues/customer-service-grocery-cashier`
- Instacart-style public datasets

### P2: Use Only as Secondary Reference

- `sonos-nlu-benchmark/snips_built_in_intents`
- small shopping-assistant / grocery-chatbot datasets
- product catalog / grocery classification / receipt datasets

## Dataset-by-Dataset Evaluation

### 1. `AmazonScience/massive`

- type:
  large multilingual assistant NLU dataset
- scale:
  1M+ utterances, 51 languages, 60 intents, 55 slot types
- strengths:
  useful for validating the intent-classification and slot-tagging pipeline
  itself; large enough in English alone, with future Korean expansion potential
- weaknesses:
  its intent system does not directly match the grocery inventory domain;
  forcing a direct mapping into Jangoing intent labels would distort label semantics
- role in Jangoing:
  not a direct training set, but an **architecture/bootstrap benchmark**
  useful for checking whether the intent classifier, slot tagger, CRF/BERT
  heads, and evaluation code run correctly
- recommended use:
  `separate pretraining / smoke benchmark`
- not recommended:
  directly forcing MASSIVE labels into `add_item`, `mark_low`, `throw_away`, etc.

### 2. `benayas/snips`

- type:
  classic voice-assistant NLU dataset
- strengths:
  small and simple, so experiment iteration is fast
  intent+slot structure can be tested quickly
- weaknesses:
  not a grocery dataset
  the intents center on music, weather, movies, and general assistant tasks
- role in Jangoing:
  a smaller **intent/slot modeling smoke set** than MASSIVE
- recommended use:
  validate token-classification heads, BIO tagging, evaluation loop, and ONNX export
- not recommended:
  estimating grocery-domain performance

### 3. `sonos-nlu-benchmark/snips_built_in_intents`

- type:
  very small intent-classification benchmark
- strengths:
  extremely lightweight for model-code smoke tests
- weaknesses:
  too small and unrelated to groceries
- role in Jangoing:
  local baseline sanity check only

### 4. `empathyai/grocery-ner-dataset`

- type:
  grocery item/entity extraction dataset
- strengths:
  the closest public source to grocery surface extraction for `ITEM` and `CATEGORY`
  it may provide a more natural grocery vocabulary seed than synthetic data
- weaknesses:
  the entity taxonomy may differ from Jangoing's schema
  for example, it may use more fine-grained or differently structured classes
  like `fruits`, `vegetables`, `dairy`, or `meat`
- role in Jangoing:
  **slot/entity model bootstrap** and **taxonomy-expansion review source**
- recommended use:
  do not merge raw labels directly; first build an `ITEM/CATEGORY`-focused
  remapping rule set

### 5. `AmirMohseni/GroceryList`

- type:
  small grocery item/category classification-style dataset
- strengths:
  useful for expanding canonical item/category inventory
  provides a broader seed for product taxonomy than hand-growing synthetic taxonomy alone
- weaknesses:
  not an utterance-level intent dataset
  probably does not provide phrase family, action intent, or span supervision
- role in Jangoing:
  **taxonomy seed** and **normalized-value candidate source**

### 6. `pfb30/multi_woz_v22`

- type:
  multi-turn task-oriented dialogue dataset
- strengths:
  valuable when designing clarification, slot carryover, follow-up, and dialogue-state tracking
- weaknesses:
  not a grocery inventory domain
  too heavy for the current MVP single-utterance parser/annotator stage
- role in Jangoing:
  **future multi-turn design reference**

### 7. `FunDialogues/customer-service-grocery-cashier`

- type:
  grocery-store customer-service dialogue
- strengths:
  somewhat useful for seeing grocery-domain conversation tone
- weaknesses:
  closer to store interaction than to home inventory update
- role in Jangoing:
  **surface-style inspiration only**

### 8. Instacart-Style Public Datasets

- example:
  `attik/Instacart-Market-Basket-Analysis`
- type:
  basket / order / co-purchase / reorder pattern data
- strengths:
  useful later for item co-occurrence, reorder priors, and “usually bought
  together” recommendations
- weaknesses:
  no utterances, intents, or slot spans
  useful for recommendation/behavior modeling, not NLU training
- role in Jangoing:
  **recommendation / shopping-list enrichment later**

## Mapping Strategy into the Jangoing Schema

### A. What Can Be Mapped Relatively Directly

- `grocery-ner-dataset`
  - candidate mapping:
    fine-grained classes like `fruit`, `vegetable`, or `dairy`
    -> `ITEM` or `CATEGORY`
  - usage:
    slot-tagging bootstrap

- `GroceryList`
  - candidate mapping:
    item name -> canonical `ITEM`
    item category -> canonical `CATEGORY`
  - usage:
    taxonomy review input

### B. What Can Be Mapped Only Partially

- `MASSIVE`
- `SNIPS`

These do not align 1:1 with Jangoing intents. Instead, use them as:

- common text-encoder warm-up
- intent-classifier / slot-tagger code-path smoke tests
- OOD handling experiments
- calibration, confidence-threshold, and fallback-policy experiments

In other words, do not mix label semantics. Keep them as a **separate corpus for
model-structure validation**.

### C. What Must Not Be Mapped Directly

- Instacart
- product catalog / shopping search / ecommerce benchmark datasets

These are not utterance NLU datasets. Converting them directly into
`annotations` or `actions` would collapse the meaning of the data.

## Real Adoption Order

### Step 1. Right Now

1. `synthetic-v1`
2. production `/annotate`
3. human-reviewed `generated_review`, `correction`, `confirmed`, `expiry`

These three are the main data axes right now.

### Step 2. First Additional Review

1. `GroceryList`
2. `grocery-ner-dataset`

These two are the most directly useful next, because they align well with the
grocery domain and can help with both taxonomy expansion and slot-labeling reference.

### Step 3. Strengthen the Modeling Pipeline

1. `SNIPS`
2. `MASSIVE`

These matter more for **pipeline validation** than for direct domain fit.

### Step 4. Later

1. `MultiWOZ`
2. Instacart

These are more appropriate later for multi-turn design and recommendation/cart
enrichment respectively.

## Recommended Adoption Method

### 1. Do Not Merge Raw Public Datasets Directly Into Training

The original label systems differ from Jangoing. Separate them first by source:

- `source = external_massive`
- `source = external_snips`
- `source = external_grocery_ner`
- `source = external_grocery_taxonomy`

Source provenance must remain explicit.

### 2. Keep Mapped Results Separate from Raw Inputs

Example:

```text
data/external/massive/raw/
data/external/massive/mapped/
data/external/grocery_ner/raw/
data/external/grocery_ner/mapped/
```

If the raw source is overwritten, later mapping errors become hard to trace.

### 3. Do Not Force a Mapping When It Does Not Fit the `annotation-v2` Answer System

For example:

- if phrase family does not exist, leave it empty
- if intent is ambiguous, do not mix it into the training set; keep it as a review-queue candidate
- if an example requires multi-turn context, do not collapse it forcibly into a
  single-turn dataset

## First Practical Implementation Proposal

The most useful next sequence is:

1. read `GroceryList` and convert it into canonical item/category candidate CSV or JSON
2. compare it against the current `ml/taxonomy/grocery-v1.json`
3. inspect the `grocery-ner-dataset` label set
4. write an `ITEM/CATEGORY` mapping table
5. only then implement an import script

`MASSIVE` and `SNIPS` should be treated as model-experiment tracks rather than
as vocabulary import tracks.

Open Food Facts should be handled with the same principle, but because of its
size and product-record duplication, it belongs in a separate catalog track.
How to use it for brands, aliases, and category candidates, and what must exist
before `grocery-v2`, is described in
[OPEN_FOOD_FACTS_BRAND_STRATEGY.md](./OPEN_FOOD_FACTS_BRAND_STRATEGY.md).

## Relationship to the `synthetic-v1` Expansion

The recent synthetic expansion was a way to widen internal bootstrap coverage
before public datasets are connected directly.

- previous problem:
  too few item types, so the generator kept repeating similar products
- what changed:
  canonical items were expanded to 33, and alias surfaces rotate instead of
  being fixed to only one string
- effect:
  annotators now see more varied item surfaces in `generated_review`, and the
  baseline sees more item lexical diversity

So this was a strengthening step for synthetic data before external adoption,
not a replacement for external datasets.

## Cautions

- Open source does not automatically mean production-like.
- License, annotation quality, and schema mismatch must be checked.
- For assistant datasets whose intent semantics differ, the bigger risk is often
  not `label leakage` but `label distortion`.

The final standard is still Jangoing human-reviewed production annotation.
