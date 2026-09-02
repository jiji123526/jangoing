# SFT, PPO, DPO, GRPO, and Notes on Applying Them to Jangoing

## Purpose

This document organizes the terms `SFT`, `PPO`, `DPO`, and `GRPO` that come up
frequently in future Jangoing model-training discussions, and explains how each
one does or does not fit an annotation-driven kitchen NLP project.

The key questions are:

- what should be learned first from reviewed annotation
- when preference pairs are actually needed
- how realistic verifier-based reward is
- how conversational context should be handled

## 1. One-Line Definitions

- `SFT`: direct supervised fine-tuning from input/target pairs
- `PPO`: reinforcement learning where a separate reward model scores outputs
- `DPO`: direct use of preference pairs for target-model learning without a reward model
- `GRPO`: use of verifier- or judge-based reward instead of preference pairs

## 2. Why It Matters in Jangoing

Jangoing is not a free-form generation model. It needs structured outputs such as:

- relevance
- action list
- intent
- entity span
- normalized value
- phrase family
- temporal grounding consistency

So **structured decision quality** matters much more than simply producing
natural-sounding text.

Example:

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "phrase_family": "state_out_of_entity",
      "entities": [
        {
          "label": "ITEM",
          "start": 12,
          "end": 16,
          "text": "milk",
          "normalized_value": "milk"
        }
      ]
    }
  ],
  "reference_date": "2026-09-01",
  "timezone": "America/Los_Angeles"
}
```

So Jangoing training methods should be judged by how well they produce this
structure, not only by how fluent the text looks.

## 3. SFT

### Definition

`SFT` means `Supervised Fine-Tuning`. The model is trained directly on
input-output answer pairs.

Example:

Input:

```text
We're out of milk.
```

Target:

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "entities": [
        {
          "label": "ITEM",
          "text": "milk",
          "normalized_value": "milk"
        }
      ]
    }
  ]
}
```

### Role in Jangoing

The first thing to do is almost always SFT.

- reviewed annotation can be used directly as ground truth
- it can create the basic competence needed to replace the parser or power the annotation assistant
- it provides the first baseline for relevance, intent, slots, and joint tasks

### Advantages

- simplest to implement
- best fit for the current project data structure
- easy to define quality gates
- expands immediately as reviewed annotation grows

### Limits

- it cannot directly express preferences like “which of these two answers is better?”
- ambiguous context behavior may require additional methods later

### Current Recommended Conclusion

In Jangoing, the **first learned model should be SFT-based**.

## 4. PPO

### Definition

`PPO` uses a separately trained reward model, built from preference pairs, to
drive reinforcement learning updates on the target model.

Flow:

```text
preference pairs
-> reward model training
-> reward model scores target model outputs
-> PPO updates the target model
```

### Example in Jangoing

Suppose the same prompt has two structured outputs and the annotator chooses the better one.

Example:

- A: `mark_out + add_to_buy`
- B: only `mark_low`

If the annotator prefers A, the reward model could in principle generalize that
multi-action and intent choice preference.

### Advantages

- can build a reward model that generalizes preferences
- the reward model can score outputs it never saw directly
- can align the model toward more desirable annotation proposals

### Disadvantages

- heavier overall structure
- needs a separate reward-model dataset
- high compute cost
- risk of reward hacking, instability, and implementation complexity

### Current Recommended Conclusion

This is still too heavy for Jangoing right now. It only becomes worth
considering once there is enough preference-pair scale and enough operational
reason to justify a reward model.

## 5. DPO

### Definition

`DPO` uses preference pairs directly, without a separate reward model. It pushes
up the probability of the `chosen` response and pushes down the probability of
the `rejected` response.

Flow:

```text
prompt + chosen/rejected pair
-> increase chosen probability
-> decrease rejected probability
```

### Where Jangoing Can Create Pairs

- parser prediction vs final reviewed annotation
- assistant draft vs final reviewed annotation
- accepted-as-is draft vs heavily edited draft

Example:

- rejected: parser incorrectly interprets as `add_item`
- chosen: human review corrects it to `update_expiry`

### Advantages

- much simpler than PPO
- no separate reward model needed
- fits the current correction workflow naturally
- promising for improving annotation assistant quality

### Disadvantages

- requires clear chosen/rejected pairs
- clean annotation without pairwise comparison is not directly usable
- tends to push or pull whole responses without fine-grained control over which
  part was wrong

### Current Recommended Conclusion

For Jangoing, **DPO is far more realistic than PPO**, especially for improving
an annotation assistant or for transitioning from a parser to a learned model.

## 6. GRPO

### Definition

`GRPO` uses verifier- or judge-based reward instead of preference pairs.

The core idea is to generate multiple completions for the same prompt, score
them, and compare each score to the average reward for that prompt group.

So:

```text
prompt
-> multiple completions
-> verifier scoring
-> group-relative reward
-> policy update
```

### Verifiers That Are Feasible in Jangoing

#### Format verifier

- JSON schema is valid
- relevance/intent/label values are allowed
- phrase family is valid for the selected intent

#### Span verifier

- `raw_utterance.slice(start, end) === text`
- no span overlap
- valid start/end range

#### Normalization verifier

- normalized value exists in the canonical list
- `LOCATION` is in the allowed set
- date format is `YYYY-MM-DD`

#### Temporal verifier

- does `next Friday` resolve consistently against the stored `reference_date`?
- are timezone and normalization result consistent?

#### Ontology verifier

- penalize if relevance is non-actionable but the action list is not empty
- penalize if `shopping list` appears but `add_to_buy` is absent
- penalize if `out of` appears but the model returns only `mark_low`

### Advantages

- does not require building a large preference-pair dataset
- easy to express annotation conventions as verifier rules
- domain-specific checkers can be added incrementally
- fits structured-output tasks well

### Disadvantages

- depends on high-quality verifiers
- reward shaping is difficult
- if the task is too easy or too hard, the learning signal weakens
- semantic nuance is difficult to capture with deterministic verifiers alone

### Current Recommended Conclusion

In Jangoing, GRPO is **realistic for strengthening structured consistency**.
But it is much harder if used as a one-shot solution for full conversational meaning.

## 7. The Hardest Thing in GRPO: Context Reading

### Core Judgment

The hardest part of GRPO is **designing verifiers for context reading**.

Schema, spans, normalized values, and temporal grounding are relatively
mechanical to check. Context understanding often includes:

- implicit intent inference
- pronoun resolution
- distinguishing preference from immediate action
- state carry over multiple turns
- cases where something sounds correct but should not actually trigger an action

These are hard for verifiers to score deterministically in code.

### Realistic Strategy

Rather than using GRPO to solve all of Jangoing's context problem at once, it
is more appropriate to use it only for **verifiable context subtasks**.

In short:

```text
context understanding itself -> hard for GRPO
context consistency and structured resolution -> feasible for GRPO
```

### Context Verifiers That Are Relatively Feasible for GRPO

- whether the model correctly refers back to an entity in the previous turn
- whether `it`, `that`, or `those` links to a real prior candidate
- whether the chosen antecedent literally exists in the prior-turn text
- whether the current output contradicts previously confirmed state
- whether a relative date is consistent with stored `reference_date`
- whether a used context field is actually supported by evidence in a prior turn

Example:

```text
User: We bought oat milk yesterday.
User: Put it in the fridge.
```

Then it is relatively feasible to verify:

- whether the referent of `it` exists in prior context
- whether the chosen referent is `oat_milk`
- whether the location intent is linked to `fridge`

### Context Verifiers That Are Hard for GRPO

- is this sentence a preference or an action?
- what does the user really want in this context?
- is this a household habit or a one-off?
- did the model infer an unstated premise appropriately?
- what subtle pragmatic choice should separate `add_to_buy` from `mark_low`?

Example:

```text
We're having guests tomorrow, so maybe grab more drinks.
```

This mixes all of the following at once:

- whether it is a real action request
- whether it is preference/context instead
- whether `grab more drinks` means `add_to_buy` or only a suggestion

Deterministic verifiers are weak once this kind of open-ended pragmatic
interpretation enters the task.

### The Output Schema Can Be Changed to Make Verification Possible

If context reasoning remains completely hidden, it is hard to verify. If part of
the context interpretation is moved into explicit output fields, verification becomes easier.

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
- whether `resolved_to` truly exists in prior context
- whether `evidence_turn_index` is valid

So good verifier design often requires exposing some of the context resolution
as explicit structured output instead of trusting hidden reasoning.

## 8. Realistic Role Split in Jangoing

At the current stage, the most natural role split is:

- `SFT`: learn basic context reading and structured-output ability
- `GRPO`: reinforce structural correctness such as schema, action count,
  antecedent existence, temporal consistency, state consistency, and allowed ontology
- `DPO` or human preference: correct ambiguous interpretation issues such as
  relevance boundary, implicit action, preference vs actionable, and whether
  clarification is required
- `PPO`: reconsider only much later, when scale and operational complexity can be justified

## 9. Practical Priority Order for Jangoing

At the current stage, the priorities are clearer than any RL method:

1. keep expanding reviewed annotation
2. build per-task baselines
   - relevance
   - intent
   - slots
   - joint
3. design deterministic verifiers
4. clean up logging for parser/draft vs final reviewed annotation pairs
5. only then run DPO or GRPO experiments

### Recommended Order

```text
SFT
-> verifier design
-> DPO-ready pair collection
-> GRPO on verifier-friendly subtasks
-> DPO for proposal quality
-> PPO only if clearly justified later
```

## 10. Final Conclusion for Jangoing

- `SFT`: the most important training method right now
- `DPO`: realistic for improving annotation assistant and parser-replacement quality
- `GRPO`: promising for structured consistency and narrow context subtasks
- `PPO`: possible long term, but currently too heavy

So in Jangoing, **reviewed supervised baselines + verifier design + pair-logging
design** come first, and RL-style methods are the next problem after that.
