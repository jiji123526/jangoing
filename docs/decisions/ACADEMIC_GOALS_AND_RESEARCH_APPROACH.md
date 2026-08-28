# Academic Goals and Research Approach

## Purpose

This document defines Jangoing as a research project rather than only a product
implementation. It records the academic objective, research questions,
methodology, major design choices, rejected or deferred alternatives, and the
reasons behind those choices.

The product roadmap is maintained in [PLAN.md](../planning/PLAN.md). Annotation
rules are maintained in
[ANNOTATION_CONVENTIONS_KO.md](../annotation/ANNOTATION_CONVENTIONS_KO.md).

## Academic Objective

Jangoing studies how natural household utterances can be transformed into
grounded, reviewable, and temporally consistent food-management actions.

The central objective is:

> To design and evaluate a human-in-the-loop situated language understanding
> system that maps conversational utterances to structured household food
> state changes while preserving temporal grounding, provenance,
> interpretability, and safe user control under resource constraints.

The target is not merely an intent classifier. The research object is the
combined system:

```text
conversational relevance detection
+ semantic parsing
+ entity normalization
+ temporal grounding
+ household state tracking
+ interactive correction
+ resource-constrained inference
```

The application domain is deliberately narrow enough to support precise state
and evaluation, but broad enough to expose difficult language phenomena:

- indirect requests and implicit state reports;
- domain language that contains no action;
- multi-action utterances;
- generic and product-specific item references;
- relative dates and delayed annotation;
- preferences and conversational context;
- unseen food items and surface forms;
- ASR-like noise;
- edge-device latency and memory constraints.

## Research Questions

### RQ1: Relevance in natural conversation

How accurately can a system distinguish actionable food-management language
from preferences, grocery-domain non-actions, and unrelated conversation?

The important comparison is not only actionable versus unrelated. Domain
non-actionable utterances are hard negatives:

```text
We need milk.                    -> actionable
I prefer oat milk.              -> contextual_preference
Milk is expensive these days.   -> domain_non_actionable
The train was late.             -> unrelated
```

### RQ2: Data-source effectiveness

How should deterministic synthetic data, AI-assisted drafts, and naturally
occurring reviewed utterances be combined to maximize generalization?

The project will measure whether synthetic data improves rare-class coverage
without inflating evaluation through template similarity.

### RQ3: Modular hybrid versus end-to-end modeling

Does a modular pipeline provide a better accuracy, interpretability, safety,
and maintenance trade-off than an end-to-end model?

The initial pipeline separates:

```text
relevance
-> intent
-> entity spans
-> deterministic normalization
-> schema validation
-> confirmation
```

Later experiments may compare this with shared-encoder, multi-task, or
structured end-to-end models on the same frozen evaluation set.

### RQ4: Temporal grounding

How much does explicit original-utterance temporal context improve expiry
normalization and temporal consistency?

The central temporal hypothesis is:

```text
relative expression meaning
= original reference_date
+ original timezone
```

Annotation time and assistant-processing time are not valid replacements for
the original utterance context.

### RQ5: Annotation efficiency

Do correction, low-confidence, expiry, relevance-hard-negative, and
AI-assisted queues produce more useful labels per unit of human effort than
uniform random annotation?

Useful evidence includes:

- model improvement per reviewed example;
- correction time;
- draft acceptance and edit rates;
- class and phrase-family coverage;
- error reduction on targeted evaluation slices.

### RQ6: Edge deployment trade-offs

What accuracy, latency, memory, and energy trade-offs arise when a compact
language-understanding pipeline is deployed on a Raspberry Pi or another
resource-constrained runtime?

Candidate comparisons include:

- TF-IDF versus DistilBERT-class models;
- FP32 versus quantized ONNX;
- local inference versus remote inference;
- model-only versus hybrid model-and-rule execution.

## Research Scope

### In scope

- English household food-management language;
- utterance-level relevance;
- intent and multi-action representation;
- entity span extraction;
- canonical item, quantity, unit, location, and date normalization;
- temporal interpretation grounded to the original interaction;
- user correction as supervised evidence;
- offline, slice, latency, and eventual online evaluation;
- Raspberry Pi feasibility.

### Deferred

- multilingual transfer;
- unconstrained open-domain dialogue;
- automatic execution without confirmation;
- image and barcode understanding;
- full ontology induction;
- learned recommendation ranking;
- retrospective semantic event time beyond expiry grounding;
- clinical or safety-critical dietary advice.

These are deferred to prevent the first study from conflating language
understanding, recommendation quality, multimodal perception, and multilingual
transfer.

## Methodological Approach

### 1. Instrumented product as data-collection environment

The deployed application records inference context, prediction, user outcome,
correction, annotation, parser/model version, and timestamps. Product use
therefore creates traceable evidence rather than unversioned examples.

The research loop is:

```text
interaction
-> versioned inference
-> review/correction
-> reviewed dataset
-> reproducible experiment
-> frozen evaluation
-> deployment decision
-> monitored production outcomes
```

### 2. Hierarchical language decomposition

The system first asks whether an utterance should enter the action parser. Only
actionable language receives intent and entity analysis.

This decomposition prevents grocery vocabulary from acting as an automatic
action trigger and permits separate analysis of relevance errors and semantic
parsing errors.

### 3. Explicit semantic representation

Each actionable utterance can contain one or more actions. Each action contains:

- intent;
- phrase family;
- exact entity spans;
- normalized values.

Surface spans and normalized values are evaluated separately. This prevents a
correctly detected phrase with incorrect canonicalization from being counted as
a completely correct result.

### 4. Hybrid neural and deterministic processing

Statistical models handle linguistically variable tasks:

- relevance classification;
- intent classification;
- entity span extraction.

Deterministic code handles constrained transformations:

- quantity conversion;
- unit normalization;
- date resolution;
- schema validation;
- event persistence.

This boundary reduces hallucinated calendar values and makes normalization
failures reproducible.

### 5. Progressive baselines

Model complexity increases only when the previous baseline establishes a
measurable reference:

```text
rules
-> TF-IDF + logistic regression
-> DistilBERT sequence classification
-> DistilBERT token classification
-> optional multi-task or structured model
```

Every model is evaluated on the same approved frozen set before promotion.

### 6. Source-aware dataset construction

Dataset records preserve whether they came from:

- real user interaction;
- deterministic queue seed;
- generated review corpus;
- AI-assisted annotation draft.

Generated labels are candidates, not ground truth. Human-reviewed saved
annotations provide supervised labels.

### 7. Group-aware evaluation

Exact duplicate detection is insufficient because templates can differ only by
food name. Phrase families are therefore used to prevent closely related
structures from crossing train/evaluation boundaries.

Evaluation also separates generated and actual-user performance.

## Major Choices and Rationale

| Choice | Decision | Reason |
|---|---|---|
| Initial language | English only | Reduces annotation and tokenization variables while the pipeline is still being validated. |
| Initial modality | Text before voice | Separates NLU errors from ASR and microphone errors. |
| Interaction style | Natural utterances without a mandatory NLU trigger token | Preserves the relevance-detection problem instead of assuming every input is a command. |
| Relevance labels | Four classes | Separates immediate action, useful preference/context, grocery-domain hard negatives, and unrelated language. |
| Action representation | Multiple action groups per utterance | Avoids collapsing compound requests to the first intent. |
| Entity representation | Exact character spans plus normalized values | Supports independent span and normalization evaluation. |
| Product conditions | Identity-changing modifiers remain in ITEM; temporary state wording usually remains contextual | Distinguishes products such as `frozen_blueberries` from transient states such as `spoiled`. |
| Canonical vocabulary | Reviewed ITEM/CATEGORY/UNIT values may grow during annotation | A closed grocery list cannot cover real products, but reviewed growth preserves human oversight. |
| External product data | Use Open Food Facts as a curated catalog and entity-linking source, not utterance ground truth | Product records provide names, brands, and categories but do not provide household action intents or natural command labels. |
| Brand representation | Keep branded product mentions as full ITEM spans for the MVP | A separate BRAND label adds cost without a current independent brand-level action or constraint. |
| Relative dates | Original `reference_date + timezone` | Keeps meaning stable when annotation occurs later. |
| Date calculation | Deterministic normalizer, not LLM output | Calendar calculation must be reproducible and schema-valid. |
| Annotation assistance | AI drafts followed by mandatory human review | Reduces labeling effort without treating model output as ground truth. |
| Candidate selection | Purpose-specific queues | Supports targeted collection and later annotation-efficiency analysis. |
| Synthetic data | Bootstrap training and workflow validation only | Synthetic templates improve coverage but do not represent natural evaluation distribution. |
| Evaluation split | Explicit train/evaluation purpose plus phrase-family leakage checks | Prevents alias-only or template-level leakage. |
| First learned baseline | TF-IDF + logistic regression | Fast, interpretable, CPU-friendly, and difficult to justify skipping. |
| Transformer candidate | DistilBERT-class fine-tuning | Provides contextual representation with lower compute than full BERT. |
| Model training | Fine-tune pretrained models, do not pretrain from scratch | Available reviewed data is appropriate for task adaptation, not language pretraining. |
| State mutation | Explicit user confirmation | Limits harm from false positive predictions and preserves correction evidence. |
| Production annotation DB | Centralized Cloudflare D1 | Supports consistent multi-device annotation and one reviewed source of truth. |
| Edge deployment | ONNX and quantization evaluated after offline accuracy | Deployment constraints should be measured without prematurely fixing the model architecture. |

The wake-word and conversational rationale is expanded in
[CONVERSATION_DATA_COLLECTION_DECISION.md](./CONVERSATION_DATA_COLLECTION_DECISION.md).
The temporal decision is expanded in
[TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md](./TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md).

## Alternatives Rejected or Deferred

### Training a language model from scratch

Rejected for the current scale. The dataset is suitable for supervised
fine-tuning, not general English pretraining. Starting from a pretrained encoder
is more scientifically defensible and computationally feasible.

### Using an LLM as the sole production parser

Deferred because unconstrained output makes schema validity, latency, cost,
reproducibility, and edge deployment harder to control. LLM assistance remains
useful for annotation proposals and later comparison.

### Treating every grocery sentence as actionable

Rejected because this creates a lexical shortcut and unsafe false actions.
Domain non-actionable examples are intentionally collected as hard negatives.

### Treating synthetic labels as evaluation truth

Rejected because template-generated tests measure template recovery rather
than natural-language generalization.

### Reinterpreting relative dates at annotation time

Rejected because it changes the meaning of the original utterance and makes
labels non-reproducible.

### Closed normalized item vocabulary

Rejected because real household products form an open and evolving set.
Unrestricted automatic canonicalization was also rejected; new values require
human-reviewed annotation.

### Immediate end-to-end structured generation

Deferred until modular baselines exist. Without component baselines, an
end-to-end result would not reveal whether failures come from relevance,
intent, spans, normalization, or state application.

## Experimental Design

### Dataset gates

The current collection gates are:

- workflow pilot: 300 reviewed training and 100 evaluation candidates;
- first human-data baseline: 1,000 training and 200 evaluation candidates;
- English MVP study: 3,000-5,000 training and at least 500 evaluation
  candidates.

These are readiness thresholds, not claims that sample size alone guarantees
validity. Per-class, phrase-family, source, and entity coverage remain required.

### Baseline comparisons

Planned comparisons:

1. deterministic rules;
2. TF-IDF relevance and intent classifiers;
3. DistilBERT relevance and intent classifiers;
4. token-classification slot model;
5. hybrid full pipeline;
6. optional shared or structured model.

### Primary metrics

- relevance macro-F1 and per-class F1;
- intent macro-F1 and per-intent precision/recall/F1;
- entity exact-span precision/recall/F1;
- normalization accuracy by entity type;
- end-to-end exact action match;
- unknown false-accept rate;
- calibration error;
- correction and abandonment rates;
- p50/p95 latency and memory;
- multi-action exact match and action/entity assignment accuracy.

### Required slices

- actual user versus generated source;
- seen versus unseen item;
- direct versus indirect request;
- phrase family;
- relative versus absolute date;
- single versus multi-action;
- short versus long utterance;
- clean text versus ASR-like noise;
- activation mode;
- context-dependent versus standalone utterance.

Full promotion requirements are defined in
[MODEL_EVALUATION.md](../ml/MODEL_EVALUATION.md).

## Threats to Validity

### Sampling bias

A single household, annotator, or device does not represent the broader
population. Results must be described as domain- and population-specific until
additional participants and environments are included.

### Annotation bias

One annotator can apply conventions consistently but cannot estimate
inter-annotator agreement. A stronger study should double-label a subset and
report agreement and adjudication.

### Synthetic-template leakage

Generated utterances may differ lexically while sharing the same structure.
Phrase-family grouping and source-specific reporting reduce but do not eliminate
this risk.

### Assistant anchoring

AI drafts may bias annotators toward suggested labels. Draft acceptance,
editing, and no-draft control samples should be compared.

### Temporal coverage

Fixed reference dates and simple relative expressions do not cover all calendar
ambiguity, daylight-saving transitions, locale variation, or retrospective
event time.

### Product-state validity

A correct semantic parse does not guarantee that the inventory projection is
factually correct. User omissions, duplicate reports, and household members can
create state drift.

### Evaluation reuse

Repeated model decisions based on one test set cause implicit test overfitting.
A development validation set and a separately frozen final test set are needed.

### Edge-device external validity

Laptop latency does not predict Raspberry Pi performance. Final claims require
measurement on the target hardware.

## Ethics, Privacy, and Safety

- Raw household conversation may contain sensitive information and requires a
  defined retention and deletion policy.
- Training exports should exclude secrets and unrelated personal content.
- Source and provenance should be retained without exposing unnecessary
  identity information.
- State-changing actions require confirmation.
- Dietary or allergy recommendations must not be presented as medical advice.
- Model errors and correction behavior must be reportable rather than hidden
  behind aggregate accuracy.

## Expected Contributions

Potential academic contributions include:

1. A reproducible, source-aware dataset design for household food-state
   language with relevance, action groups, spans, normalization, and temporal
   context.
2. An empirical comparison of modular hybrid and contextual neural approaches.
3. Evidence about targeted and AI-assisted annotation efficiency.
4. A temporal-grounding protocol that keeps delayed annotation semantically
   stable.
5. An evaluation framework connecting component metrics to exact household
   actions and correction outcomes.
6. A measured accuracy-latency-memory analysis for resource-constrained
   deployment.

Claims should remain proportional to the data. A single-user personal project
can establish a rigorous system and pilot study, but broad population claims
require more participants, annotators, devices, and households.

## Current Status and Open Work

Implemented:

- production text interaction and confirmation;
- versioned inference and annotation logging;
- four-class relevance annotation;
- multi-action representation;
- exact entity spans and normalized values;
- deterministic temporal grounding;
- source-aware generated review queues;
- split leakage checks;
- TF-IDF single-intent baseline.

Open:

- dataset audit and near-duplicate reports;
- versioned `grocery-v2` catalog schema and canonical migration rules;
- curated Open Food Facts import and exact-alias entity-linking baseline;
- frozen external-evaluation support in the trainer;
- relevance baseline training;
- DistilBERT intent and relevance models;
- token alignment and slot-model training;
- multi-action structured prediction;
- calibration and shadow deployment;
- Raspberry Pi inference benchmark;
- multi-annotator and multi-household validation.

Immediate execution items are tracked in
[ACTION_ITEMS.md](../planning/ACTION_ITEMS.md).
The external product-catalog decision and implementation sequence are detailed
in
[OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md](../ml/OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md).

## Selected Foundations

- Devlin, J., Chang, M.-W., Lee, K., and Toutanova, K. (2019).
  [BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding](https://arxiv.org/abs/1810.04805).
- Sanh, V., Debut, L., Chaumond, J., and Wolf, T. (2019).
  [DistilBERT, a distilled version of BERT](https://arxiv.org/abs/1910.01108).
- Settles, B. (2009).
  [Active Learning Literature Survey](https://minds.wisconsin.edu/handle/1793/60660).
- Guo, C., Pleiss, G., Sun, Y., and Weinberger, K. Q. (2017).
  [On Calibration of Modern Neural Networks](https://arxiv.org/abs/1706.04599).
- Gebru, T. et al. (2021).
  [Datasheets for Datasets](https://arxiv.org/abs/1803.09010).
