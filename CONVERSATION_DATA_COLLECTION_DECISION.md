# Conversation Data Collection Decision

## Background

The project originally considered adding a trigger word (wake word) before user utterances so that the system would only process language explicitly directed at the assistant.

A trigger-based interaction would look like:

```text
Hey Jango, we're almost out of milk.
```

This approach is attractive from a product perspective because it simplifies activation and reduces accidental input. However, the project is intended to study how language systems recover actionable requests, relevant state, and contextual information from natural everyday conversation rather than only from explicit command syntax.

Because of that goal, the effect of a mandatory trigger word on the language-learning problem was reconsidered.

---

## Question 1: Does a trigger word reduce the value of unrelated-statement annotation?

If every utterance reaching the NLU system is already preceded by a trigger word, completely unrelated speech becomes less common in the runtime distribution.

For example:

```text
I'm tired today.
```

would usually never reach the downstream parser if the assistant only listens after an explicit wake word.

Therefore, under a strict trigger-based architecture, collecting large amounts of `unrelated_statement` data would have relatively low priority.

Some negative examples would still be useful for cases such as:

- false wake-word activations;
- users invoking the assistant and then saying something unrelated;
- abandoned or malformed requests;
- domain-adjacent speech that contains grocery vocabulary but does not imply an action.

The most useful negative examples are not necessarily fully unrelated sentences, but **domain-adjacent non-actionable language**, such as:

```text
I really like oat milk.
Milk has gotten so expensive.
We had pasta yesterday.
Spinach is healthier than lettuce.
Maybe I'll cook chicken later.
```

These examples help prevent the model from learning a simple lexical shortcut in which grocery-related words automatically imply an inventory action.

---

## Question 2: Does requiring a trigger word weaken the project's conversational focus?

Potentially, yes.

Without a trigger word, the system may need to interpret utterances such as:

```text
We're making pasta tonight, but I think the spinach is old.
```

The model must determine whether the utterance contains relevant state, an implied action, or contextual information.

If the required input is instead:

```text
Hey Jango, we're making pasta tonight, but I think the spinach is old.
```

the system has already been given an important piece of information: the utterance is explicitly directed at the assistant.

This makes the relevance-detection problem easier and can shift the project toward a conventional voice-command parser.

The project would lose even more of its conversational character if the interaction pattern became:

```text
Hey Jango, add milk.
Hey Jango, throw away the spinach.
Hey Jango, do we have eggs?
```

In that case, the main task becomes structured command parsing rather than understanding actionable information embedded in ordinary conversation.

---

## Considered Alternative: Trigger for activation only

A compromise architecture was considered:

```text
Hey Jango, we're making pasta tonight, but I think the spinach is old.
      |
      v
Wake-word detector removes the trigger
      |
      v
We're making pasta tonight, but I think the spinach is old.
      |
      v
Conversational NLU
```

Under this design, the trigger word is only a product-level activation mechanism and is not treated as a meaningful feature by the language model.

The downstream NLU problem can still be separated into:

1. **Activation**
   - wake word;
   - push-to-talk;
   - application listening state.

2. **Relevance detection**
   - actionable;
   - contextual or preference-related;
   - domain-related but non-actionable;
   - unrelated.

3. **Structured understanding**
   - intent;
   - action groups;
   - entity spans;
   - normalized values;
   - context resolution.

This remains a reasonable future product architecture.

---

## Final Decision

For the current personal project, the dataset will prioritize **natural everyday utterances without requiring a trigger word**.

The goal is to preserve the harder and more interesting language problem:

> identifying actionable requests, relevant state, and useful context from ordinary conversation rather than assuming that every input is already an explicit command.

This means examples may include:

```text
We probably need milk tomorrow.
```

Possible interpretation:

```text
actionable
-> add_to_buy / mark_low depending on annotation convention and context
```

```text
I love oat milk.
```

Possible interpretation:

```text
contextual / preference
-> no inventory action
```

```text
Milk is so expensive these days.
```

Possible interpretation:

```text
domain-related but non-actionable
```

```text
I'm exhausted today.
```

Possible interpretation:

```text
unrelated
```

```text
The spinach looks bad, maybe we should toss it.
```

Possible interpretation:

```text
actionable
-> throw_away
-> ITEM: spinach
-> "looks bad" remains unlabeled state/intent context
```

---

## Implication for Annotation Design

The annotation system represents utterance-level relevance first and actionable
structure second through intents, actions, entities, normalized values, and
phrase families.

The implemented pipeline is:

```text
raw conversation utterance
        |
        v
relevance classification
  |-- actionable
  |-- contextual / preference
  |-- domain-related non-actionable
  `-- unrelated
        |
        v
if actionable:
  actions
  intents
  entities
  normalized values
  phrase families
```

This separation would make it possible to evaluate two distinct model capabilities:

1. whether the system correctly identifies language that requires action;
2. whether it correctly structures the action once detected.

### Implemented annotation boundary

`annotation-v3` defines the persisted boundary:

- annotations store a first-class `relevance` value;
- allowed values are `actionable`, `contextual_preference`,
  `domain_non_actionable`, and `unrelated`;
- actionable annotations require at least one structured action;
- non-actionable annotations store no inventory actions;
- existing annotation clients remain compatible by defaulting omitted relevance
  to `actionable`;
- existing preference and unrelated annotations are backfilled from their
  phrase families when migration `0008_add_annotation_relevance.sql` runs.

The production annotation UI now applies that boundary as a relevance-first
workflow. Action and entity controls are shown only for `actionable` utterances;
the other three classes are saved with an empty action list.

Unsupported but understandable requests remain `actionable` and use
`unknown > unsupported_request`. This is different from a non-actionable
utterance: `unknown` means an action exists but the current action taxonomy does
not represent it, while non-actionable relevance means no inventory action
should be stored.

### Implemented dataset boundary

Reviewed export supports four task modes:

| Export task | Included records |
| --- | --- |
| `relevance` | All four human-reviewed relevance classes |
| `intent` | Actionable records only |
| `slots` | Human-reviewed actionable records only |
| `joint` | Human-reviewed actionable records only |

The relevance task permits `actions: []` and `intents: []` for non-actionable
records. The other tasks exclude those records rather than converting them into
false `unknown` actions. Legacy action payloads are also removed when a
first-class reviewed relevance says the utterance is non-actionable.

Production relevance data can be exported with:

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

Train/evaluation text duplication and phrase-family leakage checks still apply.
The resulting files contain conversational data and should not be committed to
the public repository.

### Implemented relevance review queues

Generated candidates are divided into three non-actionable review queues:

| Queue | Candidate relevance | Purpose |
| --- | --- | --- |
| `preference_context` | `contextual_preference` | Preferences, goals, dietary constraints, and useful household context |
| `domain_non_actionable` | `domain_non_actionable` | Grocery-domain hard negatives with no immediate action |
| `unrelated_negative` | `unrelated` | A smaller set of outside-domain negatives |

Candidate JSONL can omit an intent for non-actionable examples:

```json
{"id":"pref-001","text":"I prefer oat milk in coffee.","relevance":"contextual_preference"}
{"id":"domain-001","text":"Milk has gotten expensive lately.","relevance":"domain_non_actionable"}
{"id":"negative-001","text":"The train was late again.","relevance":"unrelated"}
```

It is imported through the existing generated-review command:

```bash
npm run annotation:import-generated -- --remote \
  --input path/to/relevance-candidates.jsonl \
  --label relevance-candidates-v1
```

The importer stores the generated value in
`inference_logs.request_context.candidate_relevance`. It does not write an
annotation or training label. The queue uses this value only for routing, and
the web UI uses it only as an initial selection. The annotator can change it;
only the final human-saved `annotations.relevance` is ground truth.

This separation avoids creating a circular keyword classifier. For example,
the queue does not infer that every sentence containing `prefer` is contextual
or every sentence containing `milk` is actionable. Candidate generation and
human annotation remain distinct stages.

The general `generated_review` queue excludes records carrying a non-actionable
candidate relevance, so actionable synthetic review and relevance review do not
silently mix. The new queues remain empty until an appropriate candidate JSONL
is imported; this implementation provides collection infrastructure, not an
automatically generated relevance corpus.

### Implementation commits

- `b59d137`: persist first-class annotation relevance and add migration `0008`;
- `7f4074f`: make `/annotate` relevance-first;
- `5572798`: add relevance-specific reviewed dataset export;
- `006c532`: add generated relevance review queues and candidate routing;
- `b4a31e8`: preserve conversation and activation metadata.

---

## Dataset Priorities

The dataset should not over-invest in fully unrelated speech.

Recommended relative priority:

### High priority

- natural actionable utterances;
- implicit requests;
- multi-action utterances;
- ambiguous requests requiring clarification;
- unsupported but clearly understood requests;
- domain-adjacent non-actionable utterances;
- preference and contextual statements that may matter in later conversational modeling.

### Lower priority

- completely unrelated statements;
- completely unrelated questions.

Fully unrelated examples should remain as a small negative set, but they do not need to dominate collection.

---

## Privacy and Storage Decision

Because this is currently a personal research project, the data-collection workflow can remain lightweight rather than introducing a large privacy infrastructure.

However, raw everyday conversation can unintentionally contain:

- names;
- addresses;
- phone numbers;
- employer or organization names;
- account information;
- other personal details.

Therefore, the practical policy is:

1. raw conversational data may be kept in a private/local database for experimentation;
2. raw conversation datasets should not automatically be committed to the public GitHub repository;
3. training or evaluation exports should remove obviously sensitive or irrelevant personal information where appropriate;
4. public repository examples should use synthetic, anonymized, or manually reviewed excerpts.

This keeps the project practical while avoiding unnecessary exposure of conversational data.

---

## Project Positioning

The resulting project can be described as:

> A conversational kitchen intelligence system that identifies actionable requests, relevant state, and contextual information from natural everyday language rather than requiring fixed command syntax.

If a trigger word is introduced later, it should ideally remain an activation-layer feature rather than becoming part of the language-model task itself.

### Implemented metadata boundary

Interpretation requests now accept optional metadata:

- `conversation_id`: UUID shared by turns in one conversation;
- `turn_index`: zero-based or monotonically increasing turn position, valid only
  with a conversation ID;
- `speaker_role`: `user`, `assistant`, or `system`;
- `activation_mode`: `manual_text`, `push_to_talk`, `wake_word`, or
  `always_listening`.

The Worker and local API store these values in the inference
`request_context`, and reviewed dataset export preserves them. Existing clients
may omit all four fields. The current parser does not read previous turns, so
this is a collection and replay foundation rather than a context resolver.

Current manual web requests identify `speaker_role = user` and
`activation_mode = manual_text`. Future Raspberry Pi or speech clients can set
another activation mode without changing the utterance schema.

For `wake_word`, upstream activation must strip the trigger before
`POST /commands/interpret`. For example, the stored NLU text should be
`We're almost out of milk`, not `Hey Jango, we're almost out of milk`. This
prevents the downstream model from using the trigger as a relevance shortcut.

These metadata fields use the existing `request_context` JSON, so they require
no database migration. Deploying the API and web changes is still required.
Migration `0008` is required only for the first-class annotation relevance
column introduced earlier.

### Current implementation limits

- No trained relevance classifier is deployed yet.
- The new relevance queues need imported candidate data before they contain
  records.
- Candidate relevance is not calibrated model output and must not be treated as
  confidence-bearing supervision.
- Conversation metadata is persisted, but pronouns, ellipsis, and references
  across turns are not resolved.
- Wake-word detection, speech segmentation, and ASR remain upstream future
  components.
- Fully unrelated negatives should remain smaller than domain-adjacent hard
  negatives to avoid inflating relevance accuracy with easy examples.

---

## Current Decision Summary

- Do not require a trigger word for the current data-collection and annotation phase.
- Collect natural everyday conversational utterances.
- Preserve unrelated and non-actionable examples as negative coverage.
- Prioritize domain-adjacent non-actionable examples over large volumes of completely unrelated speech.
- Route generated relevance candidates through separate review queues and treat
  their labels as suggestions rather than ground truth.
- Keep human-reviewed annotations as ground truth.
- Use the implemented relevance label and export as a separate utterance-level
  training task.
- If a wake word is added later, treat it as an activation mechanism and remove it before downstream NLU.
- Preserve conversation, turn, speaker, and activation metadata separately from
  the normalized NLU text.
- Keep raw conversational datasets private; publish only reviewed/anonymized examples or derived artifacts.
