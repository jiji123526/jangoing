# Voice Agent Pipeline and Raspberry Pi Plan

## Purpose

This document outlines the system structure needed to add a voice interface to
Jangoing.

The two main points are:

- an AI voice agent is not just a matter of attaching STT and TTS
- Raspberry Pi can serve as a capable voice input/output device, but the system
  must separate what runs locally from what runs in the cloud

## 1. Core Summary

An AI voice agent usually overlaps three technologies in streaming form:

- `ASR`: converts user speech into real-time text
- `LLM/NLU`: interprets meaning and decides the next action
- `TTS`: returns the response as natural speech

If each stage waits for the previous stage to finish completely, latency becomes
too high for the interaction to feel conversational. Production systems overlap
the stages instead.

## 2. General Speech-to-Speech Pipeline

### Stage 1: Audio Capture

- capture microphone input
- connect telephony or digital channels
- run echo cancellation, noise suppression, and gain control

### Stage 2: ASR

- produce streaming partial transcripts
- perform finalization and endpoint detection
- maintain quality on accents, code-switching, item names, and alphanumeric strings

### Stage 3: Understanding and Reasoning

- interpret the transcript
- consult prior turns, user profile, inventory state, and enterprise knowledge
- combine LLMs, intent models, deterministic rules, and policy guardrails as needed

### Stage 4: Action and Orchestration

- inventory lookup
- shopping-list mutation
- external tool calls such as CRM, account, scheduling, or payment
- parallelize work where possible to reduce latency

### Stage 5: TTS

- use streaming TTS to minimize time to first audio
- tune voice, prosody, and domain-specific pronunciation

## 3. Why the Latency Budget Matters

Human conversation becomes awkward as soon as pauses between turns get too long.
Roughly one second is the total response budget.

That budget is spent across:

- endpoint detection
- ASR finalization
- LLM/NLU inference
- tool/API latency
- TTS first audio
- network and media overhead

So voice quality depends more on **end-to-end latency budget management** than
on the accuracy of any one individual model.

## 4. Turn-Taking and Barge-In

This is the part that most strongly determines whether a system sounds human.

- the caller may interrupt the agent while it is speaking
- TTS should stop immediately
- the interruption should enter the pipeline as new input
- the agent's own TTS should not be re-captured as new speech

If this is designed poorly, the result is:

- the agent talks over the caller
- pauses are mistaken for turn completion
- backchannels and true interruptions are confused
- too much dead air appears

## 5. What Changes When Applied to Jangoing

Jangoing is currently a text-first pipeline.

```text
user text
-> parser / future model
-> confirmation
-> event storage
-> inventory projection
```

When voice is added, a speech layer wraps around the front and back:

```text
user speech
-> audio capture
-> streaming ASR
-> Jangoing NLU / policy / inventory lookup
-> confirmation / action planning
-> TTS response
```

The key principle is to **keep the inventory reasoning pipeline intact and place
the voice layer on top of it**.

## 6. Why ASR Is Especially Hard for Jangoing

The places where general ASR is weak are often the most important slots for
Jangoing:

- item names
- brand names
- quantities
- units
- dates
- code-switching
- household-specific terms

Examples:

- `oat milk` vs `whole milk`
- `carton` vs phonetically similar words
- `Coke Zero`, `LaCroix`, `gochujang`
- `next Friday`

So Jangoing voice quality depends less on raw word error rate and more on
**whether structured fields survive intact**.

## 7. Why Endpointing Is Important for Jangoing

Jangoing utterances may be extremely short, or may be long natural-language
reports.

Examples:

- `Add milk.`
- `We're out of milk.`
- `The yogurt expires next Friday.`
- `I think we're probably almost out of eggs, and the milk might go bad tomorrow.`

If endpointing is too eager, it cuts the sentence in the middle. If it is too
slow, every turn feels sluggish. Because Jangoing cares about fine-grained
distinctions such as `mark_low`, `mark_out`, `update_expiry`, and `add_item`,
endpointing errors easily cascade into downstream interpretation mistakes.

## 8. Why Grounding Is Especially Important

Jangoing is not an open-ended chatbot. It is a system that must act relative to
**the current household state**.

Example:

```text
Put it on the list.
```

That cannot be processed from the transcript alone. At minimum, the system
needs:

- the referent from the previous turn
- current inventory state
- existing shopping list
- prior user preference
- stored `reference_date` / `timezone`
- unresolved ambiguity state

So the voice layer must be tightly connected to Jangoing's grounding structure.

## 9. Clarification and Multi-Turn Interaction

Clarification matters in text, but it matters even more in voice.

Example:

```text
User: We have no milk.
Agent: Do you want me to mark milk as out of stock only, or also add it to the shopping list?
User: Add it too.
Agent: Done. Milk is marked out, and I added it to your shopping list.
```

Once this kind of loop exists, turn-taking, barge-in, and context carry become
major quality drivers.

## 10. What Raspberry Pi Can Do

Raspberry Pi is fully viable as a voice client.

### Roles That Fit Pi Well

- microphone input
- speaker output
- push-to-talk button
- wake word
- local audio playback
- short canned prompts
- optional lightweight local TTS

### Roles That Are Heavy on Pi

- high-quality low-latency neural TTS
- complex ASR
- heavy LLM inference
- long-context reasoning

So the realistic first step is to split responsibilities:
**Pi handles I/O, while the cloud handles understanding and primary speech generation**.

## 11. Raspberry Pi Speech Output Modes

### Mode A: Cloud TTS -> Pi Playback

Flow:

```text
Pi records user speech
-> server interprets
-> cloud TTS generates audio
-> Pi streams or downloads audio
-> Pi plays it
```

Advantages:

- strong voice quality
- strong multilingual and prosody quality
- easy implementation

Disadvantages:

- network dependence
- possible additional latency
- poor offline behavior

### Mode B: Local TTS on Pi

Examples:

- `espeak-ng`
- `piper`
- `flite`
- lightweight ONNX TTS

Advantages:

- possible offline operation
- fast fallback
- better privacy profile

Disadvantages:

- voice quality may be worse than cloud TTS
- tight CPU, memory, and tuning constraints

## 12. Recommended Hybrid Structure for Jangoing

The most realistic starting point is hybrid:

```text
Normal response:
Cloud TTS -> Pi playback

Fallback / ultra-short prompts:
Local audio or local TTS on Pi
```

For example, the following can be preloaded on the Pi or handled by local TTS:

- `Okay.`
- `I didn't catch that.`
- `Please repeat the item name.`
- `I'm checking your inventory.`
- `The connection is unstable.`

Long confirmations or explanations are better suited to cloud TTS.

## 13. Recommended Voice MVP Structure for Jangoing

### Step 1: Keep the Text Pipeline

Keep the current text confirmation path unchanged.

### Step 2: Add a Voice Adapter

```text
audio in
-> ASR
-> same text interpretation pipeline
-> same confirmation policy
-> TTS / audio out
```

### Step 3: Push-to-Talk

Push-to-talk is more stable than wake word at the start.

Reasons:

- reduces accidental activation
- simplifies endpointing
- makes debugging easier
- separates ASR/NLU errors from activation errors

### Step 4: Clarification Turns

Allow clarification questions and answers to be spoken.

### Step 5: Barge-In and Full Duplex

Only after that should more human-like turn-taking be added.

## 14. Reliability and Failure Design

Production systems must assume partial failure.

Examples:

- ASR hears the item name incorrectly
- inventory lookup times out
- TTS becomes slow
- cloud inference becomes unavailable
- Pi network disconnects
- audio device error

Recommended fallbacks:

- `I didn't catch the item name. Could you repeat it?`
- `I'm having trouble checking your inventory right now.`
- `Do you want to continue on your phone?`
- text/web handoff when the AI layer fails

So even if voice fails, the existing web product should be able to take over the session.

## 15. Metrics to Measure

### Voice Interaction Metrics

- ASR endpointing latency
- time to first transcript
- time to first audio
- end-to-end turn latency
- barge-in interruption latency
- ASR correction rate for item/unit/date fields
- clarification rate
- false interruption rate
- fallback frequency

### Jangoing-Specific Metrics

- voice vs text intent accuracy
- voice vs text slot accuracy
- expiry/date normalization accuracy under ASR noise
- confirmation completion rate
- successful inventory mutation rate
- handoff-to-web rate

## 16. Recommended Build Order

1. stabilize text NLU / annotation / baseline model
2. freeze confirmation and clarification policy
3. build a Pi audio input/output shell
4. connect cloud ASR to the existing text pipeline
5. connect cloud TTS to Pi playback
6. add short local fallback prompts
7. productionize push-to-talk
8. add multi-turn spoken clarification
9. add wake word
10. refine barge-in and full duplex

## 17. Single-User ASR Personalization

The current product is aimed at one user first, so these steps should be
prioritized before more general multi-speaker ASR training:

- reduce input variance with push-to-talk and a fixed microphone
- generate per-request keywords from current inventory and shopping list
- store confirmation corrections as personal ASR feedback pairs
- evaluate slot accuracy centered on item, quantity, unit, and date
- correct repeated personal pronunciation errors only with a confusion layer
- consider fine-tuning only for acoustic errors that remain after the above

Detailed design for provider comparison, personal frozen sets, dynamic
vocabulary, and fine-tuning gates is defined in
[Personalized ASR Strategy for a Single User](./PERSONALIZED_ASR_STRATEGY.md).

## 18. Final Conclusion

Adding voice to Jangoing is not just a matter of attaching STT and TTS.

The core concerns are:

- ASR accuracy for inventory fields
- endpointing
- clarification turn-taking
- grounded household state usage
- confirmation safety
- latency budget management
- fallback design

One-line summary:

```text
Voice for Jangoing is not just speech I/O.
It is a real-time grounded interaction layer on top of the existing inventory reasoning pipeline.
```
