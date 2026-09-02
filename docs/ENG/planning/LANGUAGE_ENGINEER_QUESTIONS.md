# Questions to Ask a Language Engineer

## Purpose

This document is a question list for discussions with a Language Engineer about
improving Jangoing's annotation workflow and data-feeding method.

The goal is to avoid asking something vague like "What do you think of this
project?" and instead narrow the conversation to concrete questions about
annotation ontology, queue operations, dataset export, and training order based
on the structure that already exists.

## Current Project Assumptions

Briefly sharing the following assumptions before asking questions usually leads
to better answers.

- Jangoing is an English text-based kitchen inventory NLP MVP.
- A rule-based parser and human confirmation flow are already implemented.
- Annotation is stored in the order
  relevance -> action -> intent -> entity span -> normalized value -> phrase family.
- The relevance classes are `actionable`, `contextual_preference`,
  `domain_non_actionable`, and `unrelated`.
- Dataset sources are mixed: real correction data, confirmed data,
  generated review, synthetic bootstrap, and a relevance-candidate queue.
- Export can be separated by `relevance`, `intent`, `slots`, and `joint` tasks.
- Expiry/date data stores both `reference_date` and `timezone`.
- Long term, the plan is to extend from a TF-IDF baseline to DistilBERT-class
  models, context-aware models, and eventually a voice workflow.

## First 5 Questions to Ask

If time is short, these five are enough.

1. Is the current annotation structure
   `relevance -> intent -> entity -> normalized value`
   appropriate for an initial English household NLP MVP, or should it be
   simplified first?
2. In what order and ratio is it safest to feed synthetic data, generated
   review data, and real correction data into training?
3. Is it right to preserve multi-action annotation now, or should the first
   baseline be restricted to single-action only?
4. Is the current strategy of strongly canonicalizing normalized values at
   annotation time appropriate, or should raw mention and canonical mapping be
   separated more cleanly?
5. Which annotation queue should be prioritized now for the highest model gain?
   Is the best order something like `expiry`, `domain_non_actionable`,
   `generated_review`, `correction`, `low_confidence`, or something else?

## 1. Annotation Ontology

### Relevance Design

- Are the four classes `actionable`, `contextual_preference`,
  `domain_non_actionable`, and `unrelated` appropriate for the current goal?
- Should the boundary between `domain_non_actionable` and
  `contextual_preference` be made sharper, or is it better to merge them for
  an early model?
- Is it correct to keep `needs_clarification` and `unknown` as intents, or
  would it be better to treat them as metadata or as a separate rejection class?
- In a conversational setting without a wake word, should the relevance
  classifier be trained as a strong independent first step?

### Intent Design

- Is the current intent set too fine-grained, or does it actually align well
  with product actions?
- Should `mark_low`, `mark_out`, and `add_to_buy` stay separated in annotation?
- Was it right to separate `set_low_threshold` from ordinary inventory updates?
- Is it appropriate to keep `query_inventory` inside the same ontology as
  action intents?

### Multi-Action Design

- Does storing sentences like
  `We're out of milk, add it to the list` as an action list actually help model
  training?
- For the first baseline, is it better to exclude multi-action data and train
  single-action only?
- If multi-action stays, at what level should export and evaluation happen:
  utterance-level, action-level, or both?

### Value of Phrase Family

- Does the current approach, where annotators assign phrase families directly,
  provide enough downstream value for modeling or error analysis?
- Should phrase family remain training-data metadata as it is now, or would it
  be better kept only for analysis?
- Is the phrase-family granularity too fine given the annotator burden?

## 2. Entities and Normalization

### Entity Span Design

- Are the current exact-span labeling rules appropriate for token
  classification training?
- For some expressions, would broader spans be better, or is the current
  minimal semantic span strategy right?
- Is it correct to keep expressions like `out of`, `low on`, `spoiled`, and
  `ripe` as raw context rather than entities?

### Generic vs Specific Item

- How should generic mentions and specific mentions be managed for pairs like
  `milk` vs `whole_milk` or `crackers` vs `saltine_crackers`?
- Is the current direction valid: keep mention-level specificity in annotation
  and do household-specific linking only at runtime?
- In an environment with many generic item mentions, at what level should the
  canonical taxonomy be designed so that annotation and inference do not both
  become unstable?

### Normalized Value Governance

- Is it good to enforce normalized values strongly at annotation time?
- Should raw mention, canonical mention, and runtime-linked household item ID
  be separated into three layers?
- Allowing the annotator to add a new canonical value directly is fast but
  creates drift risk. What is the minimum acceptable governance?
- When canonical values need to change or merge, how should annotation history
  be versioned?

## 3. Queue and Annotation Workflow

### Queue Priority

- Is the current queue priority
  `expiry -> domain_non_actionable -> preference_context -> generated_review -> low_confidence -> correction`
  reasonable?
- When production correction data is still sparse, is it appropriate to rely
  heavily on generated review?
- At what point should annotation priority shift from synthetic/generated data
  toward actual user correction data?

### Annotator Efficiency

- Using AI drafts as prefills can speed up annotation but may also increase
  bias. What kind of auditing is needed?
- Among phrase family, normalized value, and entity span, which fields are
  relatively safe for AI prefill and which must be decided directly by humans?
- If disagreement measurement is added, which samples should be double-labeled
  for best efficiency?

### Reviewed Dataset Quality

- At what point does second-pass QA or random auditing become mandatory?
- What criteria are appropriate for removing exact duplicates, alias-only
  duplicates, and phrase-family template leakage?
- Is it correct to separate evaluation candidates during annotation time, or is
  it better to separate them only at freeze time?

## 4. Data Feeding Method

### Source Mixing

- The reviewed dataset currently tracks provenance such as `synthetic`,
  `generated_review`, `correction`, `confirmed_unannotated`, and
  `assistant_prefilled`. During training, how much separation or weighting
  should there be by source?
- Is the current role split reasonable:
  synthetic for warm start, generated review for coverage expansion, and
  correction for production error repair?
- In the actual training loop, should there be source-specific sample weights
  or curriculum learning?

### Task Separation

- Is it appropriate to keep `relevance`, `intent`, `slots`, and `joint` export
  separated as they are now?
- Is it better at the beginning to train the relevance classifier and intent
  classifier completely separately?
- If a joint model is tried too early, is the cost from dataset sparsity likely
  to outweigh the benefit?

### Hard Negatives

- Is the current strategy valid, where `domain_non_actionable` is collected
  aggressively through a dedicated relevance queue?
- Is it correct to think that domain-adjacent hard negatives matter more for
  real relevance robustness than fully unrelated negatives?
- For intent-model training, how should these hard negatives be included?

### Temporal Data

- Relative date expressions currently store `reference_date` and `timezone` in
  annotation/export. Is that sufficient for reproducibility?
- Should temporal samples be oversampled as a rare slice?
- For expiry/date normalization, how much should stay separated between the
  parser stage and the slot-model stage?

## 5. Model Training Strategy

### Baseline Order

- Is the current planned order appropriate:
  TF-IDF baseline -> DistilBERT relevance/intent -> token-classification slot model?
- Is it better to build the first useful model as intent-only, or should
  relevance and intent be coupled from the start?
- When is the right time to begin a slot model? After how much reviewed
  `ITEM`, `EXPIRY_DATE`, `QUANTITY`, and `UNIT` coverage?

### Low-Resource Setting

- When reviewed data is still small, is a pretrained encoder clearly better
  than rule-based + shallow models?
- On small datasets, what is the least risky way to use synthetic pretraining
  or weak supervision?
- Is it generally a good strategy to build a single-action-only baseline first
  and then extend to multi-action parsing?

### Confidence and Calibration

- Current parser confidence is not calibrated. When switching to learned
  models, what calibration strategies are useful for queue routing and human
  review priority?
- Is it appropriate to use the low-confidence queue directly as an active
  learning queue?

## 6. Evaluation and Leakage

- In this project, which leakage type is most dangerous:
  exact duplicate, paraphrase template, alias-only variation, or same-household
  distribution?
- When splitting families such as `milk`, `whole_milk`, and `oat_milk`, what
  criterion gives the most honest evaluation?
- When synthetic templates and human-reviewed paraphrases are mixed, how should
  the evaluation set be separated to remain fair?
- For slot evaluation, which should be the primary metric:
  exact span match, normalized value accuracy, or intent-conditioned slot accuracy?

## 7. Conversation Extension

- Right now only `conversation_id`, `turn_index`, `speaker_role`, and
  `activation_mode` are stored. For a context-aware model, what additional
  annotation is needed?
- To handle anaphora or elliptical utterances such as
  `Put that on the list`, what form of conversation dataset should be collected now?
- Is the current strategy of collecting preference/context data separately from
  action data the right long-term choice?

## 8. Boundary Between GRPO and Context Reading

Here `SFT` means `Supervised Fine-Tuning`: the standard supervised stage where
input-answer pairs such as reviewed annotation are used directly.

### Core Observation

- GRPO is relatively well-suited to structural correctness such as schema,
  spans, normalized values, and temporal grounding.
- Full context reading, by contrast, is hard to score cleanly with a verifier.
- So in context-aware modeling, `context understanding itself` and
  `context output consistency` should be treated as separate problems.

### Why It Is Hard

Context understanding often includes:

- implicit intent inference
- pronoun resolution
- distinguishing preference from immediate action
- state carry across multiple turns
- cases where something sounds correct linguistically but should not actually
  trigger an action

These are hard for deterministic verifiers to score strongly as simply right or wrong.

### Context Verifiers That Are Relatively Feasible for GRPO

- did the model correctly refer back to an entity from the previous turn?
- does `it`, `that`, or `those` link to one of the real context candidates?
- does the chosen antecedent literally exist in the previous turn text?
- does the current output contradict prior confirmed state?
- is the relative date consistent with the stored `reference_date`?
- if a context field was used, is its evidence actually present in a prior turn?

Example:

```text
User: We bought oat milk yesterday.
User: Put it in the fridge.
```

In this case the verifier can check:

- whether the referent of `it` exists in prior context
- whether the chosen referent is `oat_milk`
- whether the location intent is linked to `fridge`

### Context Verifiers That Are Hard for GRPO

- is this sentence a preference or an action?
- what does the user really want in this context?
- is this a long-term household habit or a one-off case?
- did the model infer an unstated premise appropriately?
- should this level of implication map to `add_to_buy` or `mark_low`?

Example:

```text
We're having guests tomorrow, so maybe grab more drinks.
```

This mixes several issues at once:

- whether it is a real action request
- whether it is preference/context instead
- whether `grab more drinks` means `add_to_buy` or only a suggestion

Once open-ended pragmatic interpretation is involved, deterministic verifiers
become much weaker.

### Realistic Strategy

1. Learn basic context behavior with `SFT` first.
2. Use `GRPO` only where the result can actually be verified.
3. Use `DPO` or human preference for ambiguous context interpretation.

Recommended role split:

- `SFT`: basic context reading
- `GRPO`: structural consistency such as schema, action count, antecedent
  existence, temporal consistency, state consistency, and allowed ontology
- `DPO` or human preference: relevance boundary, implicit action,
  preference vs actionable, and whether clarification is required

In other words, SFT/DPO is usually stronger for contextual meaning itself,
while GRPO is better for reinforcing the structural correctness of outputs
after context has been read.

### You May Need to Change the Output to Make Verifiers Possible

If the model is allowed to produce only a free-form final answer, verification
becomes hard. It is easier to build context verifiers if some intermediate
fields are made explicit.

Example:

```json
{
  "context_resolution": {
    "used_prior_turn": true,
    "referents": [
      {
        "surface": "it",
        "resolved_to": "oat_milk",
        "evidence_turn_index": 3
      }
    ]
  },
  "actions": []
}
```

Then the verifier can check:

- whether `used_prior_turn` is correct
- whether `resolved_to` really exists in prior context
- whether `evidence_turn_index` is valid

So instead of trusting hidden reasoning directly, part of context resolution
should be pulled into explicit structured output.

### Good GRPO Context Tasks

- pronoun resolution using only the previous 1 to 2 turns
- deciding whether a current turn refers back to a previous item
- checking contradiction with previously confirmed inventory state
- temporal reference carryover
- deciding whether assistant text should be ignored based on speaker role

### Context Tasks Not Recommended for GRPO

- full inference over household-level long-term preference
- full open-ended conversational relevance judgment
- ambiguous multi-party dialogue intent interpretation
- pragmatic inference that depends on unstated goals

### Role of LLM-as-a-Judge

LLM-as-a-judge can be used, but it is unstable as a primary verifier.

- it is not deterministic
- the same answer can receive varying judgments
- judges also wobble on subtle context cases
- reward hacking risk is high

So it is safer as a supporting semantic check for cases deterministic verifiers
cannot cover, not as the main verifier.

### A Direct Question to Ask a Language Engineer on This Topic

```text
For context-aware NLP tasks, where would you draw the boundary between SFT/DPO
and GRPO?

More specifically:
- Which context-reading behaviors are too ambiguous for deterministic verifiers?
- Are there narrow subtasks, such as pronoun resolution, temporal carryover, or
  prior-state consistency, that you think are realistic GRPO targets?
- If you were designing the pipeline, would you keep context reading mostly in
  SFT/DPO and use GRPO only for structured consistency checks?
```

Short version:

```text
context understanding itself -> hard for GRPO
context consistency and structured resolution -> feasible for GRPO
```

## 9. Short Question Set You Can Use Directly in a Meeting

You can copy this section as-is.

```text
I'm building an English household inventory NLP system with annotation structured as:
relevance -> action groups -> intent -> entity spans -> normalized values -> phrase family.

I already have:
- rule-based parser
- human confirmation before state changes
- reviewed annotation queues
- synthetic/generated/correction data sources
- task-specific export for relevance / intent / slots / joint
- temporal grounding with stored reference_date and timezone

Given this setup, I would love your opinion on:

1. Is this annotation ontology too ambitious for an MVP, or is it a reasonable structure?
2. Should I keep multi-action annotations now, or simplify the first training baseline to single-action only?
3. How should I mix synthetic data, generated review data, and real correction data during training?
4. Am I over-canonicalizing normalized values too early at annotation time?
5. Which queue should I prioritize now for the highest model improvement:
   expiry, domain_non_actionable, generated_review, low_confidence, or correction?
6. For relevance modeling, do you agree that domain-adjacent hard negatives are more valuable than fully unrelated negatives?
7. What dataset leakage risks would you watch most carefully in this setup?
8. At what point is there enough reviewed data to justify training the first slot model?
```

## 10. Recommended Use

- Before the meeting, send only the `First 5 Questions` rather than the whole document.
- If the answers become concrete, follow up with detailed questions in the corresponding area.
- After receiving the answers, summarize separately which of annotation
  convention, queue priority, export rule, or model baseline order should change.
