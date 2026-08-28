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
-> ITEM_CONDITION: bad/spoiled if supported by the annotation convention
```

---

## Implication for Annotation Design

The current annotation system mainly represents actionable structure through intents, actions, entities, normalized values, and phrase families.

As the dataset becomes more conversational, it may be useful to explicitly separate **relevance classification** from **action annotation**.

A future conceptual pipeline could be:

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

---

## Current Decision Summary

- Do not require a trigger word for the current data-collection and annotation phase.
- Collect natural everyday conversational utterances.
- Preserve unrelated and non-actionable examples as negative coverage.
- Prioritize domain-adjacent non-actionable examples over large volumes of completely unrelated speech.
- Keep human-reviewed annotations as ground truth.
- Consider introducing a separate relevance label/task as the conversational dataset grows.
- If a wake word is added later, treat it as an activation mechanism and remove it before downstream NLU.
- Keep raw conversational datasets private; publish only reviewed/anonymized examples or derived artifacts.
