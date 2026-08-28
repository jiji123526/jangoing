# Temporal Grounding and Expiry Annotation Fix

## Background

The project currently stores timestamps for inference creation and annotation creation, while expiry normalization also uses a separate `reference_date`.

This distinction is important because the system is expected to eventually answer temporal questions such as:

```text
How long has it been since I added the eggs?
When did I put this milk in?
What expires tomorrow?
How many days have these strawberries been in the fridge?
```

To support these questions reliably, all relative-date interpretation and annotation must be grounded to the **time of the original user utterance**, not the later annotation time and not an arbitrary seed-generation date.

---

## Current Behavior

### Live user input

For normal user input, the browser currently sends:

```json
{
  "text": "The milk expires tomorrow",
  "reference_date": "2026-08-27",
  "timezone": "America/Los_Angeles"
}
```

The API stores this context in `inference_logs.request_context`.

The inference record also stores:

```text
inference_logs.created_at
```

as an ISO timestamp.

Therefore, for real user traffic there are already two separate temporal concepts:

```text
reference_date
= the user's local calendar date used to interpret relative language

created_at
= the actual timestamp when the inference was created
```

This separation is desirable.

---

## Current Problem

The deterministic expiry queue seed generator currently uses a fixed value:

```ts
const baseReferenceDate = "2026-09-01";
const baseTimezone = "America/Los_Angeles";
```

As a result, a seeded sentence such as:

```text
The milk expires tomorrow.
```

may contain:

```text
reference_date = 2026-09-01
expiration_date = 2026-09-02
```

even when the annotator is reviewing it on August 27.

This creates a mismatch with the annotation practice used for real user utterances, where relative dates have been interpreted using the user's actual local date at utterance time.

The problem is not that annotation should use the annotation timestamp.

The problem is that **synthetic/seeded examples are grounded to an artificial date that is not obvious to the annotator and may conflict with the intended temporal semantics of the dataset.**

---

## Important Principle

Relative temporal expressions must be resolved using the temporal context of the **original utterance**.

For example:

```text
User says on 2026-08-27:
"The eggs expire tomorrow."
```

The canonical expiry date should remain:

```text
2026-08-28
```

even if the annotation is performed on:

```text
2026-08-30
```

The annotation date must not change the meaning of the original utterance.

Therefore:

```text
expiry normalization source of truth
= original utterance reference_date + timezone

NOT annotation.created_at
NOT assistant proposal.created_at
NOT current browser date during later review
```

---

## Why This Matters Beyond Expiry Annotation

Temporal grounding is not only an expiry feature.

The long-term product should be able to reason over inventory history.

For example:

```text
User:
"I bought eggs today."
```

Later:

```text
User:
"How long has it been since I added the eggs?"
```

The system should be able to derive the answer from the timestamp of the original inventory event.

Conceptually:

```text
egg added_at = 2026-08-27T18:42:00-07:00

query time = 2026-08-30T10:00:00-07:00

elapsed time
= approximately 2 days 15 hours
```

This requires a stable distinction between:

1. **utterance/event time**
2. **relative-language reference date**
3. **annotation time**
4. **model/assistant processing time**

These timestamps should never be treated as interchangeable.

---

## Recommended Temporal Data Model

The project should preserve the following temporal information.

### Inference

```text
inference_logs
├── created_at
├── request_context
│   ├── reference_date
│   └── timezone
├── raw_utterance
└── predicted_interpretation
```

Meaning:

```text
created_at
= when the user interaction actually reached the system

reference_date
= local calendar date used to interpret phrases such as
  "today", "tomorrow", "next Friday"

timezone
= user's timezone at the original interaction
```

---

### Annotation

```text
annotations
└── created_at
```

Meaning:

```text
when human review occurred
```

This timestamp is useful for annotation auditing, but must **not** be used to reinterpret relative language from the original utterance.

---

### Inventory/Event records

For future temporal queries, event records should retain:

```text
events
├── created_at
├── event_type
├── item_name
├── expiration_date
└── source inference / provenance
```

`created_at` should represent when the inventory-changing event was recorded.

If the product later supports statements about past events, it may also become useful to distinguish:

```text
recorded_at
event_time
```

For example:

```text
"I bought the eggs yesterday."
```

The statement is recorded today, but the semantic event occurred yesterday.

That distinction can be added later if temporal language coverage expands.

---

## Required Fix 1: Remove Hidden Fixed-Date Semantics From Expiry Seeds

Current:

```ts
const baseReferenceDate = "2026-09-01";
```

should not silently define the meaning of every relative expiry seed without surfacing that information.

There are two acceptable approaches.

### Preferred approach

Generate each seeded sample with an explicit reference date and expose that date to the annotation workflow.

Example:

```json
{
  "raw_utterance": "The milk expires tomorrow.",
  "request_context": {
    "reference_date": "2026-08-27",
    "timezone": "America/Los_Angeles"
  }
}
```

Expected normalization:

```text
tomorrow -> 2026-08-28
```

The annotator should see:

```text
Reference date: 2026-08-27
Timezone: America/Los_Angeles
```

when reviewing the example.

### Alternative

If deterministic fixed-date seed generation is retained for reproducibility, the UI must clearly expose the seed's reference date.

The date must never be hidden from the annotator.

---

## Required Fix 2: Pass Temporal Context Into Assistant Drafts

The current assistant proposal lookup reads:

```sql
SELECT raw_utterance, predicted_interpretation
FROM inference_logs
WHERE id = ?
```

This omits:

```text
request_context.reference_date
request_context.timezone
```

As a result, an assistant receives:

```text
"The milk expires tomorrow."
```

without knowing what `tomorrow` means.

The proposal flow should instead load:

```text
raw_utterance
predicted_interpretation
request_context
created_at
```

and pass the relevant temporal context into the assistant proposal pipeline.

Conceptually:

```json
{
  "raw_utterance": "The milk expires tomorrow.",
  "reference_date": "2026-08-27",
  "timezone": "America/Los_Angeles",
  "parser_prediction": {}
}
```

---

## Required Fix 3: Do Not Let the LLM Calculate Calendar Dates

The existing project principle should remain:

> The LLM identifies the raw temporal span; deterministic code resolves the calendar date.

Example LLM output:

```json
{
  "label": "EXPIRY_DATE",
  "text": "next Friday",
  "start": 21,
  "end": 32
}
```

The server should then compute:

```text
next Friday
+ reference_date
+ timezone
-> 2026-09-04
```

using the existing date normalizer.

The LLM should not be trusted to invent:

```json
{
  "normalized_value": "2026-09-04"
}
```

without deterministic verification.

This also avoids the current failure mode where the model may return:

```text
normalized_value = "tomorrow"
```

which fails the ISO-date annotation schema.

---

## Required Fix 4: Make Expiry Suggestions Use Stored Temporal Context

The annotation UI currently reuses `expiration_date` stored in the reviewed or predicted interpretation.

That is acceptable when the value was computed correctly at inference time.

However, when a normalized expiry date is missing or needs to be recomputed, the system should use:

```text
stored request_context.reference_date
+
stored request_context.timezone
```

rather than:

```text
new Date()
```

at annotation time.

This guarantees reproducibility.

---

## Required Fix 5: Display Temporal Context During Annotation

For any utterance containing relative temporal language, the annotation UI should display something like:

```text
Temporal context
Reference date: 2026-08-27
Timezone: America/Los_Angeles
Original inference: 2026-08-27 18:42 PDT
```

This is particularly important for:

```text
today
tomorrow
yesterday
next Friday
this weekend
in three days
a week from now
```

Without the original reference date, a human annotator cannot reliably determine the correct normalized date.

---

## Required Fix 6: Add Regression Tests

At minimum, add tests covering the following cases.

### Relative date uses stored reference date

```text
reference_date = 2026-08-27
utterance = "The milk expires tomorrow."

expected:
expiration_date = 2026-08-28
```

### Annotation occurs later

```text
utterance date = 2026-08-27
annotation date = 2026-08-30

expected:
"tomorrow" still resolves to 2026-08-28
```

### Assistant receives temporal context

Verify that assistant draft construction receives:

```text
reference_date
timezone
```

from the stored inference context.

### Invalid LLM date does not produce HTTP 500

If the model returns:

```json
{
  "label": "EXPIRY_DATE",
  "text": "tomorrow",
  "normalized_value": "tomorrow"
}
```

the proposal flow must not crash.

The raw span should either:

1. be normalized deterministically; or
2. be retained for human review without accepting the invalid normalized value.

### Timezone boundary

Test at least one case where the user's local date differs from UTC.

Example:

```text
America/Los_Angeles local date: 2026-08-27
UTC date: 2026-08-28
```

Expected relative-date interpretation must follow the user's local reference date.

---

## Future Temporal Query Architecture

The longer-term system should support questions such as:

```text
"How long has it been since I added the eggs?"
```

That query should not depend on annotation data.

It should be answered from the event timeline.

Conceptually:

```text
User query
    |
    v
query_inventory / temporal query
    |
    v
resolve ITEM = egg
    |
    v
find most relevant egg event
    |
    v
event.created_at / event_time
    |
    v
calculate elapsed duration using current user timezone
```

Example:

```text
egg event:
2026-08-25T19:30:00-07:00

query:
2026-08-27T21:30:00-07:00

answer:
"You added the eggs about 2 days ago."
```

For this reason, temporal metadata should be treated as first-class product data rather than only as an annotation convenience.

---

## Future Extension: Recorded Time vs Semantic Event Time

Eventually, some utterances will refer to events that did not happen at the moment of speech.

Example:

```text
"I bought eggs yesterday."
```

The system receives this sentence on August 27.

Then:

```text
recorded_at = 2026-08-27
event_time = 2026-08-26
```

For questions such as:

```text
"How long have the eggs been here?"
```

`event_time` is more meaningful than `recorded_at`.

This is not required for the immediate fix, but the data model should avoid assumptions that make this extension difficult later.

---

## Decision

The project will use **original-user-time temporal grounding** as the canonical rule.

### Source of truth

For language interpretation:

```text
request_context.reference_date
+
request_context.timezone
```

For actual inventory-history questions:

```text
event timestamp / semantic event time
```

### Never use as semantic reference

```text
annotation.created_at
assistant_proposal.created_at
current annotation-session date
arbitrary hidden seed date
```

unless they explicitly represent the original event being described.

---

## Implementation Priority

1. Load `request_context` in `/annotations/proposal`.
2. Pass `reference_date` and `timezone` into assistant proposal context.
3. Normalize EXPIRY_DATE spans deterministically rather than trusting the LLM.
4. Prevent invalid LLM date output from causing HTTP 500.
5. Surface reference date/timezone in `/annotate`.
6. Remove or clearly expose the hidden `2026-09-01` seed reference date.
7. Add temporal regression tests.
8. Preserve event timestamps for future elapsed-time queries.
9. Later introduce semantic `event_time` if retrospective statements are supported.

---

## Summary

The purpose of this change is not merely to fix incorrect expiry suggestions.

It establishes the temporal foundation needed for the system to reason about inventory history.

The key rule is:

> Interpret relative language using the user's original temporal context, and answer later temporal questions from the actual event timeline.

This allows expiry annotation today and future questions such as:

```text
"How long has it been since I added the eggs?"
```

to share one consistent temporal model.
