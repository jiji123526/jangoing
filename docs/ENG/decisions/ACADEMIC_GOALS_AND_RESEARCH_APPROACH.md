# Academic Goals and Research Approach

## Purpose

This document defines Jangoing as a research project rather than only a product
implementation. It records the academic objective, research questions,
methodology, major design choices, rejected or deferred alternatives, and the
reasons behind those choices.

The product roadmap is maintained in [PLAN.md](../planning/PLAN.md). Annotation
rules are maintained in
[ANNOTATION_CONVENTIONS.md](../annotation/ANNOTATION_CONVENTIONS.md).

## Academic Objective

Jangoing studies how natural household utterances can be transformed into
grounded, reviewable, and temporally consistent food-management actions.

The central objective is:

> To design and evaluate a human-in-the-loop situated language understanding
> system that maps conversational utterances to structured household food
> state changes while preserving temporal grounding, provenance,
> interpretability, safe user control, and efficient single-user adaptation
> across typed and spoken Korean-English interaction under resource
> constraints.

The target is not merely an intent classifier. The research object is the
combined system:

```text
conversational relevance detection
+ semantic parsing
+ entity normalization
+ temporal grounding
+ household state tracking
+ interactive correction
+ personalized speech and language adaptation
+ Korean-English code-switch resolution
+ household-scoped taxonomy feedback
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
- speaker-specific pronunciation and recurring ASR confusions;
- Korean-English code-switching within and across utterances;
- household-specific aliases, brands, and category preferences;
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

### RQ7: Efficient single-user personalization

How much can one user's ASR and language-understanding accuracy improve through
runtime adaptation before speaker-specific model fine-tuning becomes necessary?

The primary comparison is:

```text
general pretrained model
-> fixed language/device profile
-> dynamic household vocabulary
-> personal confusion correction
-> correction-derived supervised adaptation
-> optional acoustic or NLU fine-tuning
```

The hypothesis is that dynamic vocabulary, household state, and reviewed
corrections will produce most of the early item/brand/slot improvement at lower
data and compute cost than immediate speaker-specific fine-tuning. Fine-tuning
should target residual, repeatable errors rather than substitute for missing
context or taxonomy.

Personalization is not treated as the opposite of generalization. The system
separates a reusable shared base from a detachable personal adapter:

```text
shared base
  action ontology, temporal rules, safety policy, general ASR/NLU

personal adapter
  household vocabulary, aliases, confusion history, category preferences,
  user/device calibration
```

The current study can validly measure within-user improvement. A later
multi-user study can ask whether the same adaptation protocol transfers to a
new user with little data, without claiming that the first user's adapter is
itself general.

### RQ8: Korean-English code-switching

Can a mixed-language pipeline preserve entity identity, action meaning, and
temporal expressions when a single speaker switches between Korean and English?

Representative cases include:

```text
Coke Zero 다 떨어졌어.
우유 두 개 add 해줘.
Milk 유통기한을 next Friday로 update 해줘.
```

The central comparison is between:

- preserving the original mixed-language transcript and resolving it with
  bilingual aliases and phrase families;
- translating the full transcript to English before semantic parsing;
- using separate monolingual pipelines.

The working hypothesis is that surface-preserving bilingual normalization will
retain brand spelling, entity spans, and correction provenance better than
translation-first processing.

### RQ9: Household feedback and taxonomy adaptation

How should user-provided item categories, aliases, and corrections improve a
household taxonomy without being mistaken for utterance-level linguistic
ground truth or universal catalog truth?

The project separates:

```text
utterance annotation
-> what was explicitly said and what it meant

inventory category override
-> how this household groups a known item

catalog relation evidence
-> a provenance-bearing proposal for item/category/brand relationships
```

This permits immediate household personalization while preserving a controlled
path for promoting repeated evidence into a versioned global taxonomy.

## Research Scope

### In scope

- English household food-management language as the primary baseline;
- a single-user Korean-English code-switching pilot after the English baseline;
- utterance-level relevance;
- intent and multi-action representation;
- entity span extraction;
- canonical item, quantity, unit, location, and date normalization;
- temporal interpretation grounded to the original interaction;
- user correction as supervised evidence;
- dynamic household vocabulary and personal ASR confusion evidence;
- bilingual item/action/date aliases that preserve original surface spans;
- household-scoped item-category overrides as catalog relation evidence;
- offline, slice, latency, and eventual online evaluation;
- Raspberry Pi feasibility.

### Deferred

- broad multilingual transfer beyond the Korean-English single-user pilot;
- population-level claims about Korean-English code-switching;
- unconstrained open-domain dialogue;
- automatic execution without confirmation;
- image and barcode understanding;
- unrestricted automatic ontology induction;
- learned recommendation ranking;
- retrospective semantic event time beyond expiry grounding;
- clinical or safety-critical dietary advice.

These are deferred to prevent the study from conflating a controlled
single-user personalization experiment with broad multilingual, multimodal, or
population-level generalization.

### Generalization strategy

The project follows a **personalized-first, generalizable-architecture**
strategy.

- The current product and pilot optimize for one defined user, household, and
  device.
- Shared language representations, action schemas, temporal rules, and safety
  constraints remain user-independent.
- Personal audio, aliases, vocabulary weights, correction rules, and household
  preferences remain isolated from the shared base.
- Broad generalization is a later empirical question requiring additional
  users, devices, and user-level train/evaluation separation.

This scope creates a defensible bounded claim now while preserving a path to
study zero-shot and few-shot adaptation for future users.

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

### 8. Layered personalization before fine-tuning

Personalization is treated as a sequence of increasingly expensive
interventions:

```text
device and language hints
-> dynamic vocabulary from current household state
-> personal alias/confusion rules
-> retrieval of reviewed corrections
-> parameter-efficient or full fine-tuning
```

Each layer must demonstrate incremental improvement on a frozen personal
holdout. This distinguishes context adaptation from acoustic or model-parameter
adaptation and prevents fine-tuning from hiding correctable data-modeling
errors.

The implementation boundary is:

```text
SharedBase
  versioned ontology
  general relevance/intent/slot model
  temporal normalizer
  schema and safety validation

PersonalAdapter
  user and device profile
  dynamic household phrase set
  reviewed ASR confusion pairs
  household aliases and category overrides
  optional user-specific model parameters
```

Personal evidence must not update shared parameters or global taxonomy
relations without an explicit, provenance-preserving promotion process.

### 9. Surface-preserving bilingual processing

Mixed Korean-English transcripts retain their original text and character
spans. Translation may be used as an auxiliary feature or comparison, but not
as the canonical annotation record.

```text
speech
-> mixed transcript
-> bilingual entity/action resolution
-> canonical structured action
```

This design permits separate measurement of ASR, code-switch interpretation,
normalization, and downstream action errors.

### 10. Evidence-separated taxonomy learning

Linguistic annotations, product catalogs, and user grouping choices remain
separate evidence sources with provenance. A category selected in the
Inventory UI can immediately affect household display behavior, but it enters
the future `grocery-v2` catalog as relationship evidence rather than an
automatic global taxonomy mutation.

## Major Choices and Rationale

| Choice | Decision | Reason |
|---|---|---|
| Initial language | English baseline, followed by a single-user Korean-English pilot | Preserves a controlled baseline while making code-switching a measured extension rather than an untracked production behavior. |
| Initial modality | Text before voice | Separates NLU errors from ASR and microphone errors. |
| Generalization strategy | Personalized-first with a reusable shared base and detachable personal adapter | Produces measurable value for the actual user without coupling general semantics or safety policy to one speaker. |
| Personalization order | Runtime context and correction layers before model fine-tuning | Dynamic vocabulary and household state can solve lexical errors more cheaply and reversibly than parameter updates. |
| Code-switch representation | Preserve the mixed-language transcript and normalize afterward | Translation-first processing can erase entity spans, brand spelling, and the location of ASR errors. |
| Interaction style | Natural utterances without a mandatory NLU trigger token | Preserves the relevance-detection problem instead of assuming every input is a command. |
| Relevance labels | Four classes | Separates immediate action, useful preference/context, grocery-domain hard negatives, and unrelated language. |
| Action representation | Multiple action groups per utterance | Avoids collapsing compound requests to the first intent. |
| Entity representation | Exact character spans plus normalized values | Supports independent span and normalization evaluation. |
| Product conditions | Identity-changing modifiers remain in ITEM; temporary state wording usually remains contextual | Distinguishes products such as `frozen_blueberries` from transient states such as `spoiled`. |
| Canonical vocabulary | Reviewed ITEM/CATEGORY/UNIT values may grow during annotation | A closed grocery list cannot cover real products, but reviewed growth preserves human oversight. |
| Inventory category feedback | Apply immediately at household scope and retain as catalog relation evidence | A personal grouping choice is useful taxonomy evidence but is not automatically an utterance label or universal category fact. |
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
| Personalized training | Fine-tune only after runtime adaptation plateaus on a frozen personal set | Avoids overfitting one speaker, device, phrase list, or recording condition without measurable benefit. |
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

### Immediate speaker-specific ASR fine-tuning

Deferred because recurring item errors may come from missing vocabulary,
microphone conditions, or household context rather than the acoustic model.
Dynamic keywords, fixed device conditions, and correction-based confusion
analysis are evaluated first. Fine-tuning is justified only when repeatable
acoustic errors remain and a separate personal holdout exists.

### Translating code-switched speech before annotation

Rejected as the canonical data path because translation can rewrite brands,
remove the original entity span, normalize ambiguity prematurely, and make ASR
errors impossible to localize. Translation remains a valid experimental
baseline.

### Treating category overrides as CATEGORY annotations

Rejected because an item can be grouped under `Drinks` even when the word
`drinks` never occurred in the utterance. Overrides are item-category relation
evidence; `CATEGORY` annotation requires an actual category mention.

## Experimental Design

### Dataset gates

The current collection gates are:

- workflow pilot: 300 reviewed training and 100 evaluation candidates;
- first human-data baseline: 1,000 training and 200 evaluation candidates;
- English MVP study: 3,000-5,000 training and at least 500 evaluation
  candidates.

These are readiness thresholds, not claims that sample size alone guarantees
validity. Per-class, phrase-family, source, and entity coverage remain required.

The initial personalized speech pilot uses a separate operational gate:

- approximately 150-250 recorded utterances from the target user and device;
- at least 50-80 utterances frozen for provider and adaptation comparison;
- English-only, Korean-only, code-switched, item/brand, quantity, date, and
  realistic noise coverage;
- recording-session separation where possible.

These ranges are experiment-starting heuristics, not a claim that this amount
is sufficient for acoustic fine-tuning. Fine-tuning readiness is determined by
repeatable residual errors and learning curves on the frozen personal set.

### Baseline comparisons

Planned comparisons:

1. deterministic rules;
2. TF-IDF relevance and intent classifiers;
3. DistilBERT relevance and intent classifiers;
4. token-classification slot model;
5. hybrid full pipeline;
6. optional shared or structured model.

### Personalized speech and language comparisons

The personalized study adds staged ablations:

1. general ASR with no household context;
2. language/device hints;
3. dynamic item and brand keywords;
4. personal alias and confusion correction;
5. correction-derived adaptation;
6. optional fine-tuned multilingual checkpoint.

Every stage is evaluated on the same frozen personal audio set. Training and
evaluation recordings must be separated by utterance template and, where
possible, recording session and noise condition.

### Generalization ladder

The claims and experiments expand in stages:

1. **Within-user:** does the adapter improve the target user's frozen holdout?
2. **Across sessions/devices:** does the gain survive new recording sessions,
   noise conditions, and compatible microphones?
3. **Zero-shot new user:** how well does the shared base work without another
   user's adapter?
4. **Few-shot new user:** how much reviewed data is needed to create a useful
   new adapter?
5. **Population-level:** how stable are gains and failure rates across users,
   accents, households, and language habits?

Only the first two stages are in the current single-user scope. Stages three
through five require additional participants and user-disjoint evaluation.

### Code-switching comparisons

The code-switch study reports separate results for:

- English-only;
- Korean-only;
- Korean syntax with English item or brand;
- English syntax with a Korean item;
- multiple switches in one utterance;
- Korean counters, quantities, and relative dates.

Natural personal usage distribution and deliberately difficult diagnostic
slices are reported separately. Synthetic balance must not be presented as the
user's natural code-switch distribution.

### Taxonomy-feedback comparisons

Inventory override evidence is evaluated through:

- automatic category accuracy before and after household feedback;
- correction and repeated-override rate;
- existing-category membership coverage;
- `Other` and catalog-unknown rate;
- agreement among user overrides, reviewed language data, and external catalog
  evidence;
- seen-item versus unseen-item category resolution.

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
- multi-action exact match and action/entity assignment accuracy;
- ASR entity word error rate for item, brand, quantity, unit, and date;
- code-switch action and slot exact match;
- personal correction and clarification rate;
- improvement per minute of collected personal audio;
- household category override and taxonomy-proposal accuracy.

### Required slices

- actual user versus generated source;
- seen versus unseen item;
- direct versus indirect request;
- phrase family;
- relative versus absolute date;
- single versus multi-action;
- short versus long utterance;
- clean text versus ASR-like noise;
- typed versus spoken input;
- English-only, Korean-only, and code-switched speech;
- code-switch location and frequency;
- baseline versus dynamic vocabulary versus personalized correction;
- microphone distance, noise condition, and recording session;
- automatic versus user-overridden category;
- household relation evidence versus global catalog evidence;
- activation mode;
- context-dependent versus standalone utterance.

Full promotion requirements are defined in
[MODEL_EVALUATION.md](../ml/MODEL_EVALUATION.md).

## Threats to Validity

### Sampling bias

A single household, annotator, or device does not represent the broader
population. Results must be described as domain- and population-specific until
additional participants and environments are included.

The personalized study intentionally optimizes for one speaker. Its valid claim
is improvement for that defined user/device/household configuration, not
speaker-independent ASR or bilingual population performance.

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

### Personalization overfitting

A model can memorize one speaker's scripted commands, microphone, or phrase
inventory without improving natural interaction. Frozen utterances, separate
recording sessions, noise slices, and staged learning curves are required.

Personal adapter data must also remain isolated from shared-base evaluation.
Otherwise a system may appear generally better because the target user's
aliases or recordings leaked into the global model.

### Code-switch distribution validity

Generated mixed-language examples may exaggerate switch frequency or use
unnatural switch points. Naturally occurring personal code-switch data and
synthetic diagnostic cases must be reported separately.

### Taxonomy feedback circularity

If user overrides define the taxonomy and the same relations are used to
evaluate it, accuracy becomes circular. Evaluation must hold out items or
relations and distinguish household preference accuracy from global catalog
correctness.

## Ethics, Privacy, and Safety

- Raw household conversation may contain sensitive information and requires a
  defined retention and deletion policy.
- Raw voice contains speaker-identifying biometric characteristics; audio
  retention and training consent must be explicit and independently revocable.
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
7. An ablation study of runtime personalization versus speaker-specific
   fine-tuning using a reusable shared-base/personal-adapter architecture.
8. A surface-preserving Korean-English code-switch annotation and evaluation
   protocol for grounded household actions.
9. A provenance-aware method for turning household category corrections into
   taxonomy relation evidence without contaminating linguistic labels.

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
- TF-IDF single-intent baseline;
- inventory category overrides with household-scoped production persistence;
- documented single-user ASR and Korean-English code-switching experiment
  design.

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
- personal frozen audio collection and ASR provider adapter;
- dynamic bilingual ASR context-pack generation;
- bilingual Korean-English action and entity normalization;
- correction-derived personal ASR evidence storage;
- runtime-personalization ablation and optional fine-tuning experiment;
- shared-base and personal-adapter interfaces with separate versioning;
- conversion of inventory overrides into `grocery-v2` relation evidence;
- household-scoped new-category proposal workflow;
- Raspberry Pi inference benchmark;
- future user-disjoint zero-shot and few-shot adapter evaluation;
- multi-annotator and multi-household validation.

Immediate execution items are tracked in
[ACTION_ITEMS.md](../planning/ACTION_ITEMS.md).
The external product-catalog decision and implementation sequence are detailed
in
[OPEN_FOOD_FACTS_BRAND_STRATEGY.md](../ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md).
The staged voice-personalization and code-switching protocol is detailed in
[PERSONALIZED_ASR_STRATEGY.md](../planning/PERSONALIZED_ASR_STRATEGY.md).

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
- Radford, A. et al. (2023).
  [Robust Speech Recognition via Large-Scale Weak Supervision](https://proceedings.mlr.press/v202/radford23a.html).
