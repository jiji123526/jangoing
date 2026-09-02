# Personalized ASR Strategy for a Single User

## Purpose

The goal is to adapt Jangoing voice input to one user while minimizing:

- the time spent recording and transcribing data manually
- inference cost on Raspberry Pi and on the server
- maintenance cost when new items and brands appear
- the cost of recovering from incorrect inventory mutations

Here, `customized ASR` does not mean training a personal acoustic model from
the start. For a single user, it is more efficient to first combine **fixed
input conditions, dynamic vocabulary biasing, a personal confusion lexicon, and
a correction-driven feedback loop**.

## Conclusion

The first implementation should use this structure:

```text
push-to-talk audio
-> audio normalization + VAD
-> cloud ASR with English hint and dynamic kitchen keywords
-> personal confusion correction + inventory-aware candidate resolution
-> existing Jangoing parser/model
-> editable confirmation
-> confirmed event
```

The initial ASR candidate should be `gpt-transcribe`, because it can receive
request-level `prompt`, `keywords`, and `languages`. But the provider must not
be hardcoded into the architecture; an adapter should allow Google, Azure, and
local engines to be evaluated on the same personal benchmark set.

Acoustic fine-tuning is not the first step. It should only be tested after
vocabulary and post-processing are already in place, and only when the same
pronunciation or accent errors still repeat and enough corrected audio exists to
measure improvement on a separate holdout.

## 1. How to Exploit the One-User Condition

Unlike a multi-user service, the following variables are mostly fixed:

- the speaker and accent
- dominant language habits and code-switching patterns
- Raspberry Pi microphone and installation position
- room echo and kitchen noise type
- commonly used item, brand, unit, and action expressions

So rather than optimizing for general English WER, the system can optimize for
**reconstructing Jangoing slots correctly for this user on this device**.

The downside is that fine-tuning on one person's voice can easily overfit to
specific phrases, mic distance, or quiet conditions. Personalization and the
evaluation environment must therefore stay separated.

## Personalized-First, Generalizable Architecture

Optimizing for one user now and keeping future generalization possible are not
opposite goals if shared behavior and personal data are separated.

```text
Shared base
  action ontology
  general relevance / intent / slot behavior
  temporal grounding
  schema validation and safety policy
  provider-neutral ASR interface

Personal adapter
  Korean-English usage profile
  microphone/device calibration
  current inventory and shopping keywords
  personal pronunciation/confusion pairs
  household aliases and category preferences
  optional user-specific fine-tuned parameters
```

### Why Personalized-First

- The actual product currently has one user, so it creates measurable value immediately.
- Accent, microphone, code-switch position, and household vocabulary can all be constrained.
- Runtime adaptation and correction effects can be tested with relatively little data.
- It avoids pretending to have broad generalization without the population-level
  data needed to support that claim.

### How to Preserve Generalization Potential

- Keep personal audio and corrections in user-scoped storage.
- Keep action schema, temporal rules, and safety policy only in the shared base.
- Do not auto-promote personal aliases into global canonical aliases.
- Record base-model version and adapter version separately.
- New users start from an empty adapter, not another user's adapter.
- When more users exist, evaluate zero-shot base and few-shot adapters with user-disjoint splits.

So the valid research question right now is not:

```text
Does one user's adapter generalize to everyone?
```

It is:

```text
How much extra value does a personal adapter add beyond the general baseline?
How little data is needed to apply the same adapter protocol to a new user?
```

The first question is answerable now. The second becomes testable only once
additional participants exist.

## 2. Highest-Leverage Actions First

### 2.1 Start With Push-to-Talk

Do not start wake word and continuous listening at the same time.

- utterance start is explicit
- background speech is less likely to be sent into ASR
- endpointing errors and activation errors can be separated cleanly
- button release can act as an end-of-turn signal

VAD should only trim front/back silence and long pauses inside the pressed
interval. Tune it so it does not split one utterance into two because of short
hesitations in the user's normal speaking style.

### 2.2 Fix Language and Input Conditions

The current MVP is English-first, so early requests should carry an English
language hint. Expand allowed languages only when code-switching appears
reliably in actual use. Unnecessary automatic language detection increases
misclassification risk for short commands.

Initial hardware experiments should use the same microphone, gain, and distance.
Normalize the server input format into one standard, such as mono PCM/WAV.
Stable gain, anti-clipping, and fixed microphone placement matter more than the
raw sample rate.

### 2.3 Korean-English Code-Switching

For a single user, Korean-English code-switching is relatively feasible because
the language combination, accent, likely switch positions, and repeated
vocabulary can all be restricted in a personal profile. The current OpenAI
transcription API can already take `languages` and `keywords` together, so the
request context can look like:

```json
{
  "languages": ["ko", "en"],
  "prompt": "A Korean and English kitchen inventory command. Preserve brand and product names in the language spoken.",
  "keywords": [
    "우유",
    "milk",
    "Coke Zero",
    "코크 제로",
    "냉장고",
    "fridge",
    "유통기한",
    "expiry date"
  ]
}
```

Expected difficulty depends on code-switch type:

| Type | Example | Expected difficulty |
| --- | --- | --- |
| switching between sentences | `우유가 없어. Add it to the list.` | low |
| English item/brand only | `Coke Zero 다 떨어졌어.` | low-medium |
| English action only | `우유 두 개 add 해줘.` | medium |
| repeated switching inside one sentence | `milk 유통기한을 next Friday로 update 해줘.` | medium-high |
| mixed or reduced form inside one word | private compounds or incomplete personal pronunciations | high |

Even if ASR succeeds, the current English-first NLU may still fail to interpret
Korean action expressions. So code-switching support should split into two layers:

```text
multilingual ASR:
speech -> mixed transcript with original language preserved

bilingual normalization/NLU:
mixed transcript -> canonical item, action, quantity, date
```

Do not translate the whole transcript into English first. Translation can erase
entity spans, spoken form, brand spelling, and the exact ASR error location.
Instead, preserve the surface form and link aliases and phrase families to
canonical values.

```text
우유 / milk / 밀크                 -> milk
코크 제로 / Coke Zero             -> coke_zero
다 떨어졌어 / 없어 / out of       -> mark_out
목록에 넣어 / add to the list     -> add_to_buy
```

Links such as `밀크 -> milk` are safer as `speech_alias` mappings separate from
item normalization. If the user says `milk` broadly, auto-selecting
`whole_milk` is an ambiguity issue that already exists independently of code
switching and should still follow the existing ambiguity policy.

Do not require a separate manual language dictionary. Build the bilingual
context pack automatically from:

1. canonical items in the taxonomy and their Korean/English aliases
2. actual items and brands in current inventory and shopping list
3. Korean/English entity surfaces reviewed in annotation
4. ASR transcript corrections made during confirmation
5. recently frequent personal phrases and confusion pairs

The personal evaluation set should not collapse all language results into one
average. Report these slices separately:

- English-only
- Korean-only
- Korean sentence with English item/brand
- English sentence with Korean item
- multiple switches in one utterance
- Korean counters, quantities, and relative dates

If code-switching is rare in real use, do not force half the benchmark to be
mixed speech synthetically. Keep actual usage ratio and hard-case evaluation
ratio separate.

Fine-tuning is still not the first response. For a single user, bilingual
keywords, speech aliases, and correction logs are cheaper and easier to update.
Only consider multilingual checkpoint fine-tuning if the same code-switch
acoustic errors keep repeating across enough independent utterances.

### 2.4 Build a Small Dynamic Vocabulary Per Request

Do not always pass the full grocery dictionary. Build an `ASR context pack`
containing only terms likely to be spoken right now.

Priority:

1. items and aliases currently in inventory or shopping list
2. items recently added, edited, or searched
3. mistaken surfaces and corrected spellings from recent ASR corrections
4. brands and product variants actually used in the household
5. units, locations, and date expressions needed by the current action
6. the rest of the taxonomy as low-priority fallback

Example:

```json
{
  "language": "en",
  "prompt": "A short kitchen inventory command about groceries, quantities, locations, and expiry dates.",
  "keywords": [
    "Coke Zero",
    "whole milk",
    "frozen blueberries",
    "saltine crackers",
    "two cartons",
    "expires next Friday"
  ]
}
```

Vocabulary list size should be chosen from personal evaluation, not provider
marketing limits. If too many words are strongly biased, false positives can go
up by causing the ASR to hear items the speaker never said. Google also notes
that higher boost can reduce false negatives while increasing false positives.

### 2.5 Add a Personal Confusion Layer After ASR

Correct frequent ASR mistakes without retraining the model itself.

```text
"coke cereal" -> "Coke Zero"
"two cardons" -> "two cartons"
```

Do not apply these as global string substitutions. Also require:

- does the corrected candidate exist in current inventory, shopping list, or alias catalog?
- is the phrase in an expected entity position?
- is the pronunciation or string distance clearly separated from competing candidates?
- does the corrected transcript yield a valid action schema after parsing?

If two or more candidates remain, do not auto-confirm. Route to confirmation or
clarification. For example, if inventory contains both `whole_milk` and
`oat_milk` and the user says `milk`, ASR post-processing must not choose one
arbitrarily.

### 2.6 Reuse Existing Confirmation as ASR Annotation

When the user edits the transcript or the structured action, the system can
capture the following pair without a separate annotation UI:

```text
audio
raw_asr_text
corrected_text
asr_context_pack
parsed_action_before_correction
confirmed_action
model/provider/version
microphone/device profile
created_at
```

For efficiency, do not keep every successful audio clip permanently.

- corrected audio is kept first
- low-confidence or clarification-triggering audio is kept first
- successful audio is kept only as environment-specific evaluation samples
- if the user wants, raw audio can be deleted while transcript metadata remains

Audio includes biometric traits, so storage consent, access control, and
retention policy must be explicit. If it may later be used for training, the
user must be told that at collection time.

## 3. Personal Evaluation Set

General WER alone is not enough to judge Jangoing quality. First build a frozen
personal test set like this:

The recommended starting range is about `150-250` utterances. This is not a
standard or guarantee; it is an operational baseline for fast comparison.

- short commands covering all action families
- item, brand, variant, unit, and quantity expressions
- absolute and relative expiry dates
- hierarchically ambiguous expressions such as `milk` vs `whole milk`
- pronunciations that this user is often recognized incorrectly on
- quiet conditions, fridge/fan noise, and different microphone distances
- actionable speech plus domain non-actionable hard negatives

Use part of this set as a development set for choosing providers and
parameters. Keep at least `50-80` utterances frozen as the final holdout. Do
not use holdout sentences directly when tuning vocabulary or writing confusion rules.

### Core Metrics

- `WER`: word error rate over the full transcript
- `entity word error rate`: error rate calculated only on items, quantities,
  units, and dates
- `slot exact match`: ratio where all normalized slots are correct
- `action exact match`: ratio where both the action and the key slots are correct
- `unsafe auto-commit rate`: ratio of wrong mutations that would have executed
  without confirmation
- `clarification rate`: ratio that required asking again
- `correction rate`: ratio where the user corrected the transcript or action
- `p50/p95 latency`: time from button release to transcript/confirmation

The first selection criterion is not WER but `action exact match` and safety.

## 4. Efficient Decoding Policy

Do not send every request through the biggest model.

```text
Pass 1:
fast ASR + dynamic context pack

If transcript resolves to one valid, high-confidence action:
show normal confirmation

If item/date/quantity is unresolved or ambiguous:
retry once with a stronger model or adjusted context

If still ambiguous:
ask a narrow clarification question
```

Confidence scales differ across providers, so do not share absolute thresholds
blindly. Pick per-provider thresholds from a personal development set.

For retry conditions, prioritize not full-sentence confidence but:

- the item does not link into the ontology
- the date parser cannot produce a value
- the action is destructive and there are multiple item candidates
- the ASR text clearly conflicts with projected state

## 5. Choosing Providers and Local Engines

### First Cloud Baseline: OpenAI `gpt-transcribe`

Current official documentation recommends `gpt-transcribe` as the default model
for bounded-audio transcription and states that domain context can be provided
with `prompt`, `keywords`, and `languages`. That is useful for injecting
Jangoing's dynamic inventory vocabulary per request.

The earlier `whisper-1` prompting guide explains that prompt text can influence
product-name spelling, but it is not a guaranteed hard constraint. So prompt
output must still pass downstream validation and confirmation.

### Comparison Baseline: Google or Azure

- Google Speech-to-Text adaptation supports phrase sets, custom classes, and
  phrase-level boost, which is helpful for fine-grained per-item weighting experiments.
- Azure phrase lists apply at runtime without separate model training and expose
  a list-level weight range of `0.0-2.0`. Official guidance recommends keeping
  the phrase list at `500` items or below.
- AWS Transcribe custom vocabulary is well-suited to brands, acronyms, and
  proper nouns, and uses a table format with `Phrase` and `DisplayAs`. For
  Jangoing, it likely fits stable household vocabulary better than the request-level hot set.

Final selection should be based on accuracy, latency, and price on the same
personal frozen set, not on generic benchmark marketing.

### Offline Candidate: Vosk

The Vosk small dynamic-graph model supports runtime vocabulary updates, so it
fits narrow command grammar and dynamic item lists well. But the quality of
more natural long utterances must still be compared against the cloud baseline
on personal data.

Vosk documentation shows acoustic fine-tuning and gives an example around one
hour of data, but it requires Kaldi-format training setup. So unless offline
operation is a clear requirement, it is lower priority in the first phase.

### Raspberry Pi Candidate: `whisper.cpp`

`whisper.cpp` supports Raspberry Pi, microphone streaming, and VAD. It is
useful for local-privacy and network-fallback experiments. VAD can reduce the
audio passed to the recognizer, but model size and thread count on Pi should be
picked by measuring real-time factor and slot accuracy on the actual device.

On server CPU, `faster-whisper` INT8 and Silero VAD can also be compared. Do
not assume public benchmark numbers transfer directly to Raspberry Pi; measure
them again on the same device.

## 6. Fine-Tuning Entry Conditions

Do not fine-tune until all of the following are true:

- dynamic keywords and the personal confusion layer are already applied
- microphone and audio preprocessing are fixed
- repeated errors are confirmed to be acoustic mismatch rather than vocabulary issues
- enough corrected audio/transcript pairs have accumulated
- a separate personal holdout exists
- improvement over the baseline can be measured in slot/action exact match

Vosk's mention of roughly one hour is a reference point for a specific
adaptation path, not a guarantee of success for Jangoing. Hugging Face Whisper
examples use 8 hours for low-resource language fine-tuning and do not define
the minimum amount for personal English speaker adaptation. So do not pick an
arbitrary clip count as a success gate; determine it with a learning curve.

```text
base model
-> + vocabulary/context
-> + personal correction layer
-> + 15 min train subset
-> + 30 min
-> + 60 min
```

Evaluate the same frozen holdout at every stage. If gains flatten or ordinary
utterances get worse, keep runtime adaptation rather than fine-tuning.

## 7. Implementation Phases

### Phase 0: Personal Benchmark

1. define a fixed microphone profile
2. create a `150-250` script and frozen split
3. store raw audio, reference transcript, and expected action
4. compare at least two cloud ASR systems and one local candidate

### Phase 1: Personalization Without Training

1. define an `AsrProvider` adapter
2. implement the `ASR context pack` builder
3. combine inventory, shopping list, and taxonomy aliases into dynamic keywords
4. send push-to-talk audio to cloud ASR
5. pass the transcript into the existing text pipeline and confirmation flow

### Phase 2: Automatic Feedback Loop

1. store raw transcript and corrected transcript
2. create a personal confusion table
3. preferentially retain corrected or ambiguous audio only
4. run frozen evaluation periodically
5. compare results by provider, prompt, and keyword snapshot

### Phase 3: Pi Optimization

1. tune VAD threshold and silence duration for the user
2. compare cloud primary and local fallback
3. measure real-time factor for `whisper.cpp` and Vosk
4. provide a local narrow-command fallback when the network fails

### Phase 4: Optional Fine-Tuning

Only run this in a separate experiment branch when repeated acoustic errors are
well established. Do not replace production unless both action/slot exact match
and latency on the holdout pass the target.

## 8. Concrete Path to Choose for Jangoing Now

```text
1. Keep stabilizing the text MVP and annotation flow
2. Build a personal frozen audio set even before Raspberry Pi exists, using a laptop microphone
3. Measure `gpt-transcribe` + English + dynamic keywords as the first baseline
4. Compare one weighted-phrase baseline from Google or Azure
5. Automatically store confirmation corrections as ASR feedback pairs
6. Reuse the same audio protocol and provider adapter after Pi is introduced
7. Add local ASR and fine-tuning only if measurement shows they are needed
```

This path exploits the advantage of “only one user” first through vocabulary,
environment control, and the correction loop. The most expensive model training
remains the last option.

The architecture principle can be summarized in one line:

```text
personalize the adapter, not the shared truth
```

## 9. References

Official or project documentation checked on 2026-09-01:

- [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI Whisper prompting guide](https://developers.openai.com/cookbook/examples/whisper_prompting_guide)
- [Google Cloud Speech-to-Text model adaptation](https://cloud.google.com/speech-to-text/docs/adaptation-model)
- [Azure phrase list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/improve-accuracy-phrase-list)
- [Amazon Transcribe custom vocabulary](https://docs.aws.amazon.com/transcribe/latest/dg/custom-vocabulary.html)
- [Vosk model adaptation](https://alphacephei.com/vosk/adaptation)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Hugging Face Whisper fine-tuning guide](https://huggingface.co/blog/fine-tune-whisper)
