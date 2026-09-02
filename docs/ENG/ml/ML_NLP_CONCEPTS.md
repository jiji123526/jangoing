# Jangoing Machine Learning and Linguistics Concepts Guide

## 1. Purpose of This Document

This document explains the machine learning, natural language processing,
linguistics, data evaluation, and recommendation-system concepts that appear
while developing Jangoing, using project-specific examples. Rather than
focusing on formulas, it focuses on understanding why each concept is needed
and what role it plays in the code and the product.

It distinguishes between concepts already applied and concepts planned for
later.

- **Currently applied**: rule-based parser, intent/slot structure, inference
  logging, synthetic data, TF-IDF, Logistic Regression, grouped split, basic
  evaluation
- **Planned for later**: Transformer, token classification, context retrieval,
  calibration, multilingual model, recommendation ranking, online evaluation

## 2. Definition of the Overall Problem

Jangoing's language system must read a sentence and answer the following
questions.

```text
1. Did the user make a kitchen-related request?
2. What action does the user want?
3. What item, quantity, location, and date are needed for that action?
4. Is the expression ambiguous enough that a question is needed?
5. What context is needed from prior conversation and inventory state?
6. Can the system decide whether to execute an action, answer with information, or recommend something?
```

Example:

```text
"We're almost out of milk"
```

```json
{
  "intent": "mark_low",
  "entities": [
    {"label": "ITEM", "text": "milk"}
  ],
  "normalized": {
    "item_name": "milk"
  }
}
```

By contrast, the following sentence directly reports a zero-inventory state.

```text
"We're out of drinks"
```

```json
{
  "intent": "mark_out",
  "entities": [
    {"label": "CATEGORY", "text": "drinks"}
  ],
  "normalized": {
    "category": "beverage"
  }
}
```

## 3. Rule-Based Systems and Machine Learning

### Rule-Based Parser

This approach writes sentence patterns directly by hand.

```text
low on {item}       -> mark_low
throw away {item}   -> throw_away
do we have {item}   -> query_inventory
```

The current production interpretation works this way.

Advantages:

- You can start without training data.
- Results are deterministic and fast.
- It is easy to explain which rule produced a result.

Disadvantages:

- It is weak on expressions you did not write.
- Synonyms and indirect phrasing must keep being added manually.
- It is hard to generalize across multi-turn conversation and complex context.

### Machine Learning Model

Instead of writing every rule directly, the system learns statistical patterns
from example inputs and correct outputs.

```text
"We barely have any milk left" -> mark_low
"The juice is almost gone"     -> mark_low
"Get more coffee next time"    -> add_to_buy
```

The model uses training examples to predict the intent of sentences it has
never seen before. But it also learns the bias and errors in the data, so
reviewed data and honest evaluation are necessary.

### Baseline

A baseline is a reference model used to judge whether a new model is actually
an improvement. Jangoing's first baseline is TF-IDF + Logistic Regression.

A more complex model needs to show a meaningful improvement in accuracy,
latency, cost, or stability over the baseline before there is a good reason to
adopt it.

## 4. Supervised Learning and Labels

### Supervised Learning

This is a training method that uses data with both inputs and correct outputs.

```json
{
  "text": "Please add milk to the shopping list",
  "intent": "add_to_buy"
}
```

Here, `text` is the input and `intent` is the label or target.

### Label

A label is the correct answer the model must predict. There are intent labels
and entity labels.

```text
Intent label: add_to_buy
Entity label: ITEM
```

If label definitions are inconsistent, the model cannot learn. For example, if
one annotator records the same kind of sentence as `mark_low` and another
records it as `add_to_buy`, that can be treated as annotation disagreement.

### Human-in-the-loop

This is a workflow where the system predicts first and a human confirms or
corrects it.

```text
parser prediction -> user review -> ground truth saved -> next model training
```

The current correction UI and inference log are the foundation of this
learning loop.

## 5. Intent Classification

### Intent

An intent is the user's overall purpose or action expressed by the sentence.

Current intents:

- `add_item`: add inventory
- `update_expiry`: add or update an expiration date for existing inventory
- `consume_item`: use or consume an item
- `mark_low`: mark a low-stock state
- `mark_out`: mark a zero-inventory state
- `throw_away`: discard an item
- `add_to_buy`: add an item to the shopping list
- `query_inventory`: ask about inventory
- `needs_clarification`: related request but clarification is required
- `unknown`: unsupported request

### Classification

This is a problem of choosing one label among several.

```text
input sentence -> [score for each intent] -> most appropriate intent
```

`unknown` and `needs_clarification` are important for safety. The system must
reduce false accepts where a sentence it does not understand is forced into an
inventory-changing intent.

### Multi-class and Multi-label

The current TF-IDF baseline is a multi-class problem that chooses one label per
sentence. But `annotation-v3` currently stores multiple actions for sentences
like the following.

```text
"We finished the milk, so add it to the shopping list"
```

Each action has its own intent, phrase family, entities, and normalized values.
The current single-intent baseline does not collapse these records into the
first intent. Instead, it excludes them from training and records the excluded
count. Once enough data exists, we will compare whether multi-label
classification is sufficient or whether structured prediction that also
predicts intent-entity linkage is needed.

## 6. Slot Filling and Entity Extraction

### Slot

A slot is a structured value needed to execute an action.

```text
item_name
quantity
unit
location
expiration_date
category
```

### Entity

An entity is a meaningful span in the original text.

```text
"Add two cartons of milk"
     ^^^ QUANTITY
         ^^^^^^^ UNIT
                    ^^^^ ITEM
```

### Span

A span is the character start and end position occupied by an entity in the
original text.

```json
{
  "label": "ITEM",
  "start": 19,
  "end": 23,
  "text": "milk"
}
```

In the standard slicing rules used by Python and JavaScript, `start` is
inclusive and `end` is exclusive.

### BIO Tagging

This is a way to split a sentence into tokens and mark the beginning and inside
of entities.

```text
Add       O
two       B-QUANTITY
cartons   B-UNIT
of        O
milk      B-ITEM
```

A multi-token entity is marked like this.

```text
next      B-EXPIRY_DATE
Friday    I-EXPIRY_DATE
```

- `B`: beginning of an entity
- `I`: inside the same entity
- `O`: not an entity

This can be used later in a Transformer token-classification slot model.

## 7. Tokenization

Tokenization is the process of splitting a sentence into smaller units that a
model can process.

Word-based example:

```text
"We're out of milk"
-> ["We're", "out", "of", "milk"]
```

Transformers usually use a subword tokenizer. Even an unseen word can be split
into smaller pieces.

```text
"yogurts" -> ["yogurt", "s"]
```

In Korean, tokenization behaves differently from English because of particles,
endings, and spacing variation. When evaluating multilingual models,
language-specific entity span and token alignment need to be checked
separately.

## 8. Normalization and Canonicalization

### Surface Form

This is the expression the user actually said.

```text
eggs
drinks
two
next Friday
```

### Normalized Value

This is the standard value the system uses.

```text
eggs            -> egg
drinks          -> beverage
two             -> 2
next Friday     -> 2026-08-28 (if the reference date is 2026-08-26)
```

### Canonical ID

This is an internal ID that refers to the same concept even if the language or
alias differs.

```text
milk  -> milk
우유   -> milk
```

You need to separate the original span and the normalized value so that entity
extraction errors and normalization errors can be measured separately.

### Deterministic Normalizer

Date calculation, quantity conversion, and unit standardization are often safer
to handle with explicit programs rather than having the model guess.

```text
model: finds the span "next Friday"
date normalizer: computes the ISO date from reference date and timezone
```

## 9. Taxonomy and Ontology

### Taxonomy

This is a hierarchical structure that classifies concepts.

```text
beverage
├── water
├── milk
├── juice
├── tea
└── coffee
```

The current `grocery-v1` is a small initial taxonomy.

### Ontology

An ontology expresses not only classification but also various relationships
and constraints between concepts.

```text
milk is-a dairy product
milk may-contain allergen dairy
oat milk substitutes-for milk
```

As recommendation and safety constraints become more complex, a richer ontology
than a simple taxonomy may be needed.

### Entity Linking

Entity linking is the process of mapping an expression in the original text to
a canonical entity or category.

```text
"drinks" -> category: beverage
"coke"   -> product/brand candidate
```

If there are multiple candidates or confidence is low, the system should ask a
clarification question.

## 10. Ambiguity and Pragmatics

### Ambiguity

Ambiguity is when one expression can have multiple meanings.

```text
"Add milk"
```

Possible interpretations:

- add milk to current inventory
- add milk to the shopping list

### Pragmatics

Pragmatics is the field that interprets real meaning using situation and intent,
not just the dictionary meaning of the sentence.

```text
"There's no milk"
```

Grammatically this is a state description, but depending on the situation it
can mean:

- information that there is no inventory
- an indirect request to add it to the shopping list
- the start of a conversation about whether milk is needed

### Speech Act

A speech act is the action performed by speaking.

- assertion: state description
- request: request
- question: question
- recommendation request: recommendation request
- confirmation: confirmation

Even with the same words, if the speech act is different the system behavior
must be different.

### Implicature

Implicature is meaning that is not directly stated but is inferred from the
conversation context.

```text
"I was going to make cereal, but there's no milk"
```

Even if the user did not directly say to add milk to the shopping list, a
low-stock state or substitute recommendation may be relevant. It is risky to
convert implicature into automatic execution without evidence, so confirmation
or clarification is needed.

## 11. Context and Discourse

### Context

Context is surrounding information needed to understand the current sentence.

- recent conversation
- current inventory and expiration dates
- user preferences and allergies
- diet goals
- budget and location
- current time and timezone

### Discourse

Discourse is the structure through which multiple sentences connect to create
meaning.

```text
User: Do we have juice?
System: No, it looks like we're out.
User: Add it to the list.
```

The `it` in the last sentence must be found in the prior discourse and resolved
to juice.

### Coreference Resolution

Coreference resolution is the problem of finding what expressions like `it`,
`that`, or `the usual one` refer to.

```text
"We finished the milk. Add it to the list."
                             ^^ milk
```

### Context Retrieval

This is the process of retrieving only the information relevant to the current
request instead of putting all past information into the model. For accuracy,
cost, and privacy, only relevant context should be selected.

### Context Window

This is the range of input a model can see at once. Even if the range is large,
too much old irrelevant information can make judgment worse.

## 12. TF-IDF

TF-IDF is a way to convert sentences into numeric vectors of words and word
combinations.

### Term Frequency

This indicates how often a specific word appears in one document.

### Inverse Document Frequency

This lowers the importance of words that appear commonly in all documents and
raises the importance of words that appear distinctively in only some
documents.

```text
"low on"        -> useful for distinguishing mark_low
"shopping list" -> useful for distinguishing add_to_buy
```

The current baseline uses unigrams and bigrams.

- unigram: `low`, `milk`
- bigram: `low on`, `shopping list`

TF-IDF does not fully understand sentence order and deep meaning, but it is a
fast and interpretable first reference point.

## 13. Logistic Regression

Despite the name regression, this is a linear model widely used for
classification. It takes a TF-IDF vector as input and calculates a score for
each intent.

```text
P(mark_low | sentence)
P(add_to_buy | sentence)
P(unknown | sentence)
...
```

In the current baseline, class weights are used to reduce class imbalance, and
the random seed is fixed for reproducibility.

Because it is a linear model, it is relatively easy to inspect how specific
words and bigrams influence each intent.

## 14. Transformer and DistilBERT

### Transformer

A Transformer is a neural-network architecture that represents how words in a
sentence relate to each other using attention. It can model context and word
order much more richly than TF-IDF.

### Attention

Attention is a way of learning which other tokens should be referenced, and how
much, when interpreting the current token.

```text
"Add it to the shopping list"
```

To understand `it`, the model needs to attend to the preceding sentence or the
relevant entity.

### Pretraining and Fine-tuning

- pretraining: learning language patterns in large-scale general text
- fine-tuning: additional training on Jangoing intent/slot data for a specific
  purpose

### DistilBERT

DistilBERT is a smaller and faster Transformer-family model derived from BERT.
It is a future candidate baseline for intent and slot tasks, but it is not yet
used in production.

Before adoption, accuracy and latency must be compared against TF-IDF on the
same real frozen test set.

## 15. Synthetic Data

Synthetic data is data made by rules or generation models rather than entered
by real users.

The current `synthetic-v1` is an English 800-record dataset built using fixed
scenarios, a taxonomy, and a seed.

Advantages:

- It can balance classes quickly.
- It can intentionally include rare situations and ambiguous expressions.
- Spans and normalized answers can be created together at generation time.
- The pipeline can be validated before real data exists.

Risks:

- It may differ from the real user-expression distribution.
- The model may memorize the wording style of the generation rules.
- Synthetic test scores may look like real performance.

Therefore it can be used for bootstrap training, but the final test must be a
real human-written and human-reviewed frozen dataset.

## 16. Dataset Split and Leakage

### Train Set

This is the data used to learn the model parameters.

### Validation Set

This is the data used to choose the model and hyperparameters.

### Test Set

This is the final report card. If you keep looking at it during model
selection, you can overfit to the test itself, so it should be used only for
the final comparison.

### Data Leakage

This is when information that should not be available at training time ends up
in the training data.

Example:

```text
Train: "We're out of milk"
Test:  "We're out of eggs"
```

If the template is identical except for the product name, the test becomes too
easy.

### Phrase Family Grouped Split

This groups the same expression structure into one group and puts the whole
group into one split. The current `synthetic-v1` groups phrase families per
intent and also keeps intent balance across all splits. The real `/annotate`
data uses controlled semantic families. Multi-action records need to preserve
the action-family combination as the utterance-level family so nearly identical
compound sentences do not get mixed across splits.

### Frozen Test Set

This is a test set that is fixed once and not modified during model
development. It is used as the final standard for measuring real user
generalization.

## 17. Overfitting, Underfitting, Generalization

### Overfitting

This is the state where the model has memorized the training data but is weak
on new data.

```text
Train F1: 0.99
Test F1: 0.55
```

### Underfitting

This is the state where the model is too simple or insufficiently trained, so
performance is low on both train and test.

### Generalization

Generalization is the ability to make correct judgments on unseen expressions,
products, brands, and conversations. It is one of the most important goals in
Jangoing.

Example evaluation slices:

- known product names vs new product names
- direct commands vs indirect requests
- exact item vs category
- short sentence vs long conversation
- normal text vs ASR errors
- single-turn vs multi-turn

## 18. Hyperparameters and Random Seed

### Parameter

A parameter is a value learned by the model through training. For example, the
per-word weights in Logistic Regression.

### Hyperparameter

A hyperparameter is a setting chosen by a human before training.

- n-gram range
- regularization strength
- learning rate
- batch size
- number of epochs

### Random Seed

This is the random starting point used for shuffling data and initialization.
It should be recorded so the same experiment can be reproduced and variability
can be compared. The result from a single seed should never be interpreted as
absolute performance.

## 19. Evaluation Metrics

### Accuracy

This is the proportion of correct predictions out of all predictions. It can be
misleading when classes are imbalanced.

### Precision

This is the proportion of predictions for a specific class that are actually
correct.

```text
Precision = TP / (TP + FP)
```

### Recall

This is the proportion of actual examples of a specific class that the model
found.

```text
Recall = TP / (TP + FN)
```

### F1

F1 is the harmonic mean of Precision and Recall.

```text
F1 = 2 * Precision * Recall / (Precision + Recall)
```

### Macro-F1

This averages each intent's F1 with equal weight. It is used as a main
baseline metric because it prevents high-frequency intents from dominating the
overall score.

### Micro-F1

This is calculated by summing TP, FP, and FN across all predictions. Frequent
classes have a larger effect.

### Confusion Matrix

This shows a table of actual-label and predicted-label combinations. It is used
to find which intents are frequently confused with each other.

### Exact Match

This counts as success only when the intent and all slots are entirely correct.
It is a strict end-to-end metric for whether the real action would be correct.

### Entity-level F1

This evaluates whether the label and boundaries of slot spans are correct. It
prevents cases where only part of a token span is correct from being
overcounted as a full entity success.

## 20. Confidence and Calibration

### Confidence

Confidence is the score the model gives to its own prediction. A high score
does not guarantee high actual accuracy.

### Calibration

Calibration is how well confidence matches the actual correctness rate.

If a well-calibrated model gives 0.8 confidence to 100 cases, about 80 of them
should be correct.

### Confidence Threshold

This is a boundary below which the system chooses `unknown` or a clarification
question instead of automatic action.

```text
high confidence + safe informational request -> may answer
low confidence                              -> clarification
state-changing action                       -> confirmation regardless of confidence
```

There is a plan to measure Expected Calibration Error and reliability curves
later.

## 21. Offline and Online Evaluation

### Offline Evaluation

This evaluates the model on a fixed dataset.

- Macro-F1
- entity F1
- exact match
- calibration
- latency

It is fast and reproducible, but it cannot reflect every aspect of real usage
behavior.

### Online Evaluation

This measures user response in the real product.

- confirmation rate
- correction rate
- cancellation rate
- recommendation acceptance rate
- add-to-list rate
- incorrect-action report rate

Even if online metrics improve, optimization should not damage safety or user
goals.

## 22. Drift

Drift is when the real input distribution changes over time compared with the
training data.

Examples:

- new brand appears
- seasonal food changes
- the user's speaking style changes
- the speech-recognition engine changes

### Data Drift

This is when the input-data distribution changes.

### Concept Drift

This is when the relationship between the same input and the correct answer
changes.

If correction rate and unknown rate are logged continuously by model version,
they can reveal drift signals.

## 23. Versioning and Reproducibility

### Dataset Version

This identifies which data was used.

### Model Version

This identifies which training result was used in production.

### Parser, Normalizer, Taxonomy Version

Rules and knowledge structures outside the model also affect results, so they
must be recorded together.

### Dataset Digest

This is a hash computed from the full dataset. It confirms whether a file with
the same name has changed content.

### Reproducibility

Reproducibility is the property that the same experiment can be run again using
the code, data, seed, and environment.

The Jangoing baseline records Git commit, dataset hash, seed, Python version,
and split counts in the metrics metadata.

## 24. Recommendation-System Concepts

### Candidate Generation

This is the stage that broadly gathers recommendable candidates.

```text
inventory, expiry, shopping list, diet goals, nearby deals -> candidate list
```

### Filtering

This removes candidates that violate hard constraints such as allergies, diet
restrictions, budget, sale ended, or out of stock.

### Ranking

This determines the order of the remaining candidates.

```text
relevance + preference + price + freshness + diversity -> ranking score
```

### Rule-Based Recommender

This produces ranking with human-written scoring rules. It becomes an
easy-to-explain first baseline when data is limited.

### Content-Based Recommendation

This compares product attributes with user preferences.

```text
high-protein preference + low-sugar goal -> recommend products that match
```

### Collaborative Filtering

This uses the behavior of similar users. In an early stage with few users, the
cold-start problem is severe and privacy must also be considered.

### Learning to Rank

This learns candidate order from data such as clicks, accepts, purchases, and
rejections. If the system does not also record which candidates were shown,
position bias is hard to correct.

### Cold Start

This is the state where there is no behavior data, such as for a new user or a
new product. It is supplemented with explicit preferences, product metadata,
and rule-based recommendation.

## 25. Recommendation Evaluation Metrics

### Precision@K

This is the proportion of relevant items among the top K recommendations.

### Recall@K

This is the proportion of all relevant items that are included within the top K.

### NDCG@K

This evaluates whether highly relevant items were placed near the top. It
considers ranking order.

### Coverage

This looks at how much of the full catalog the recommendation system covers
with its recommendations.

### Diversity and Novelty

This checks whether the system keeps repeating only similar items and whether
it suggests useful items the user may not already know.

### Constraint Violation Rate

This is the proportion of recommendations that conflict with allergies, diet,
or budget. It can be a safety metric that outranks accuracy.

### Deal Freshness

This measures whether the recommended price information is still valid. Deals
need a source, observed time, expiration time, store, and unit price.

## 26. Bias and Safety

### Sampling Bias

This is the problem that collected users do not represent all users.

### Label Bias

This is the problem that the interpretation habits of labelers are reflected in
the ground truth.

### Position Bias

This is the problem of mistaking items chosen because they were shown at the
top as strong preference.

### Automation Bias

This is the phenomenon where users trust system suggestions too much. It is why
the editable confirmation UI is kept before changing state.

### Safety Constraints

Recommendations involving allergies, dietary restrictions, and health goals
must prioritize safety over simple engagement. The system should reveal its
limits where medical judgment is required.

## 27. ASR and Speech Processing

### ASR

Automatic Speech Recognition is the technology that converts speech into text.

```text
user speech -> ASR transcript -> intent/slot pipeline
```

ASR errors can be passed directly into the NLP model input.

```text
"two cartons" -> "to cartons"
"juice"       -> "Jews"
```

Therefore evaluation data should include ASR-like errors, and if possible the
system should log not only the transcript but also ASR confidence and n-best
candidates.

### Wake Word

A wake word is a specific trigger phrase that makes the voice device start
listening for commands. This is a concept for the Raspberry Pi phase and is not
currently implemented.

## 28. Concepts That Must Be Kept Separate

### Prediction and Ground Truth

- prediction: the value proposed by the model
- label/ground truth: the correct answer reviewed by a human

### Model Performance and Product Performance

- model performance: F1, exact match, calibration
- product performance: correction rate, completion time, user satisfaction,
  error recovery

### Synthetic Test and Real Test

- synthetic test: pipeline smoke test and initial comparison
- human frozen test: real generalization-performance judgment

### Intent and Outcome

- intent: the user's linguistic goal
- outcome: what happened in the product, such as confirmed, corrected, or
  cancelled

### Entity Span and Normalized Value

- span: what was said in the original text
- normalized value: what standard concept the system should use

## 29. Current Learning Order

```text
1. Use the rule-based parser as the initial reference
2. Log user prediction/correction/outcome
3. Validate the pipeline with synthetic-v1
4. Freeze the TF-IDF single-intent baseline artifact with synthetic-v1
5. Collect 300 reviewed training records and 100 evaluation records through a workflow pilot
6. Secure 1,000 reviewed training records and 200 evaluation records for the first human-data baseline
7. Review duplicate and phrase-family leakage, then freeze validation/frozen test
8. Train TF-IDF baselines separately for relevance and intent
9. Secure 3,000 to 5,000 reviewed training records and 500 evaluation records for the English MVP
10. Compare DistilBERT relevance/intent models on the same frozen set
11. Build a token-classification slot model using real spans
12. Connect model spans and deterministic normalizers in a hybrid pipeline
13. Compare production parser and model prediction in shadow mode
14. Build a structured-prediction baseline once enough multi-action data exists
15. Add context evaluation and recommendation baseline
```

Generated data and AI drafts are counted toward reviewed volume only after a
human has confirmed them and saved them as annotation.

## 30. Jangoing Technical Specification for First-Time Model Builders

### Do Not Pretrain a Language Model from Scratch

Jangoing is not a project to build a new language model from scratch using
internet-scale text. First, train a simple TF-IDF model, and later fine-tune
`distilbert-base-uncased`, which has already learned English, on Jangoing
annotations.

```text
pretraining
= learning general English itself from large-scale data

fine-tuning
= adjusting a pretrained model to Jangoing relevance, intent, and entity tasks
```

What is possible with a few thousand annotations is fine-tuning, not
pretraining. The OpenAI API is an auxiliary feature for generating annotation
drafts and is not required for Jangoing model training.

### Recommended Model Separation

At the beginning, separate the system into the following four stages rather
than using one complex model.

| Stage | Input | Output | Initial implementation | Later implementation |
|---|---|---|---|---|
| Relevance | full utterance | one of the 4 relevance classes | TF-IDF + Logistic Regression | DistilBERT classification |
| Intent | actionable utterance | one supported intent | TF-IDF + Logistic Regression | DistilBERT classification |
| Entity/slot | actionable utterance | original-text entity spans | rules/parser | DistilBERT token classification |
| Normalization | span + temporal context | canonical value | deterministic code | keep deterministic code |

The four relevance labels are:

```text
actionable
contextual_preference
domain_non_actionable
unrelated
```

If relevance and intent start as separate models, it becomes easier to measure
the causes of non-actionable sentences entering inventory intents incorrectly
and confusion among intents separately. Shared encoders or multi-task models
should be compared only after each baseline is stable.

The final hybrid pipeline looks like this:

```text
utterance
-> relevance classifier
-> intent classifier
-> entity token classifier
-> deterministic item/unit/quantity/date normalizers
-> schema validation
-> user confirmation
-> inventory event
```

For state-changing actions, user confirmation is kept even when model
confidence is high.

### Python and Libraries

The minimal environment currently installed via `ml/pyproject.toml`:

```text
Python >= 3.11
scikit-learn
joblib
pytest (dev dependency)
```

Candidates to add during the Transformer-training phase:

```text
torch
transformers
datasets
evaluate
seqeval
accelerate
optimum
onnxruntime
```

- PyTorch: gradient computation and neural-network training
- Transformers: pretrained DistilBERT, tokenizer, training utilities
- Datasets: JSONL loading, mapping, batching
- Evaluate: classification-metric calculation
- seqeval: BIO entity-span precision, recall, F1
- Accelerate: simplifies CPU, single-GPU, and multi-GPU execution differences
- Optimum/ONNX Runtime: ONNX export, optimization, inference

These dependencies have not yet been added to the repository. The current
dependencies are sufficient for TF-IDF practice.

### Input and Output of a Classification Model

A relevance or intent classifier takes a tokenized sentence and outputs logits
for each class.

```text
input:
"We're out of milk"

intent logits:
add_item       -1.3
mark_low        0.4
mark_out        3.2
add_to_buy      0.1
...

softmax:
mark_out = 0.89
```

A `logit` is a score before conversion into probabilities. `softmax` turns the
scores into values that look like per-class probabilities. During training,
weights are updated to reduce the cross-entropy loss between prediction and
ground truth. Separate calibration checks are needed before softmax values can
be treated as matching real accuracy.

### Input and Output of a Slot Model

Unlike classification, which gives one label per sentence, a slot model
predicts a BIO label for each token.

```text
Add       O
two       B-QUANTITY
cartons   B-UNIT
of        O
oat       B-ITEM
milk      I-ITEM
next      B-EXPIRY_DATE
Friday    I-EXPIRY_DATE
```

The DistilBERT tokenizer may split a word into subwords, so the annotation
character `start/end` must be aligned to tokenizer offsets or `word_ids()`.
Special tokens, padding, and subword positions that cannot receive a ground
truth label usually use `-100` so they are ignored in the loss. If this
alignment is wrong, slot labels will break even if the model architecture is
fine.

The model finds the span `next Friday`, but it does not compute the ISO date.
Date computation is handled by the shared deterministic normalizer that uses the
original inference `reference_date + timezone`.

### DistilBERT Starting Hyperparameters

The following values are not the answer. They are a starting point for the
first reproducible experiment.

| Setting | Relevance/Intent start value | Slot start value |
|---|---:|---:|
| pretrained model | `distilbert-base-uncased` | `distilbert-base-uncased` |
| max sequence length | 128 | 128 |
| batch size | 16 | 8~16 |
| learning rate | `2e-5` | `3e-5` |
| epochs | 3~5 | 4~6 |
| weight decay | 0.01 | 0.01 |
| warmup ratio | 0.1 | 0.1 |
| random seed | 42 | 42 |
| model selection | validation macro-F1 | validation entity F1 |

Measure the 95th to 99th percentile of real sentence length first to determine
max length. Jangoing sentences are short, so starting with 512 tokens is likely
to waste memory and latency. If validation macro-F1 does not improve, apply
early stopping, and confirm final numbers across multiple random seeds.

### Expected Hardware and Artifacts

- TF-IDF baseline: a normal laptop CPU and around 4 GB of memory is enough
- DistilBERT fine-tuning: an NVIDIA GPU with 8 GB or more is recommended
- 3,000 to 5,000 short sentences: usually in the range of minutes to tens of
  minutes on GPU
- CPU fine-tuning: possible, but may be slow for repeated experiments
- DistilBERT FP32 weights: roughly 250 MB
- INT8 ONNX weights: expect roughly the 60 to 100 MB range, but measure after
  actual export

Time and memory depend heavily on batch size, sequence length, and hardware. If
out-of-memory occurs, reduce batch size and use gradient accumulation. Before
Raspberry Pi deployment, measure memory, p50/p95 latency, and accuracy drop on
the actual device with the ONNX INT8 model.

### First Practice to Run Now

You can practice the full workflow with `synthetic-v1` without waiting for a
human dataset.

```bash
cd /home/jjiwoo/.workspace/jangoing

python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'

python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/first-baseline

pytest ml/tests
```

Results:

```text
ml/artifacts/first-baseline/model.joblib
ml/artifacts/first-baseline/metrics.json
```

`model.joblib` is the training artifact that stores the TF-IDF vectorizer and
the Logistic Regression classifier together. `metrics.json` contains the
dataset hash, Git commit, seed, split counts, per-class precision/recall/F1,
confusion matrix, and excluded multi-action count.

The purpose of this first practice is not to interpret synthetic scores as
production performance, but to directly verify the following flow.

```text
JSONL dataset
-> validation/split
-> vectorization
-> model.fit
-> model.predict
-> metrics
-> versioned artifact
```

### After the Human Dataset Is Large Enough

Export the dataset by reviewed task from production D1.

```bash
npm run dataset:export -- --remote --require-annotation \
  --task intent \
  --train-output ml/data/intent-train.jsonl \
  --evaluation-output ml/data/intent-evaluation.jsonl

npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/slots-train.jsonl \
  --evaluation-output ml/data/slots-evaluation.jsonl
```

Successful export does not mean dataset freeze is complete. Class/entity
distribution, near duplicates, source ratio, and normalized-value errors must
be audited, and then independent real-user evaluation candidates must be
reviewed again before fixing the dataset hash and split manifest.

### What Is Currently Implemented and What Comes Next

Currently implemented:

- reviewed JSONL export per task
- rejection of exact normalized-text and phrase-family split leakage
- TF-IDF single-intent training
- grouped internal train/validation/test split
- logging of dataset digest, Git commit, seed, metrics, and confusion matrix
- exclusion of multi-action records and logging of excluded count

Next implementation:

- class, source, phrase family, and entity-span distribution reports
- near-duplicate and template-similarity checks
- a baseline trainer that can take a separate frozen evaluation file directly
- relevance TF-IDF trainer
- DistilBERT relevance/intent trainer
- alignment pipeline that converts character spans into BIO token labels
- DistilBERT slot trainer and entity-level evaluation
- confidence calibration and unknown-threshold selection
- ONNX export, quantization, Raspberry Pi benchmark
- production shadow inference and model-version logging

The current `ml/train_baseline.py` splits one input dataset internally again.
So it does not directly evaluate an exported frozen evaluation file. Before
production-model comparison, it should be changed to receive
`--train-dataset` and `--evaluation-dataset` explicitly.

Scikit-learn `joblib` artifacts and PyTorch checkpoints should not be assumed
to run directly in a Cloudflare Worker. Training and offline evaluation should
finish locally first, and only after accuracy and latency are confirmed should
the deployment location be chosen, such as ONNX, Raspberry Pi local inference,
or a separate inference service.

## 31. Official Learning Materials

The recommended learning order is the Scikit-learn text tutorial, PyTorch
basics, Hugging Face fine-tuning, token classification, and ONNX optimization.

- [Scikit-learn: Working With Text Data](https://scikit-learn.org/stable/tutorial/text_analytics/working_with_text_data.html)
- [PyTorch: Learn the Basics](https://pytorch.org/tutorials/beginner/basics/intro.html)
- [Hugging Face Course: Fine-tuning a Pretrained Model](https://huggingface.co/learn/llm-course/chapter3/1)
- [Hugging Face: Text Classification](https://huggingface.co/docs/transformers/tasks/sequence_classification)
- [Hugging Face: Token Classification](https://huggingface.co/docs/transformers/tasks/token_classification)
- [Hugging Face Datasets documentation](https://huggingface.co/docs/datasets/)
- [ONNX Runtime: Model Quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)

At first, it is enough to understand the Scikit-learn tutorial and the current
`ml/train_baseline.py`. Move on to PyTorch and DistilBERT after directly
creating and interpreting a baseline artifact and `metrics.json`.

## 32. Related Documents

- [ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md](../decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md): academic goals, research questions, methodology
- [IMPLEMENTATION_NOTES.md](../decisions/IMPLEMENTATION_NOTES.md): implemented behavior and technical choices
- [SYNTHETIC_V1.md](./SYNTHETIC_V1.md): synthetic-v1 generation and decision record
- [MODEL_EVALUATION.md](./MODEL_EVALUATION.md): evaluation and logging principles
- [PLAN.md](../planning/PLAN.md): overall product and model roadmap
- [ACTION_ITEMS.md](../planning/ACTION_ITEMS.md): annotation scale and execution gates
- [ml/README.md](../../ml/README.md): training commands and environment setup
- [ANNOTATION_GUIDE.md](../annotation/ANNOTATION_GUIDE.md): how to use the production annotation screen
- [ANNOTATION_CONVENTIONS.md](../annotation/ANNOTATION_CONVENTIONS.md): annotation-v4 ground-truth decision rules

When adding a new model or language feature, add its concept and role in the
project to this document and clearly mark whether it is actually implemented.
