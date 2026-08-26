# jangoing Plan

## Project Summary

jangoing is a Raspberry Pi powered voice assistant for kitchen inventory tracking. The system listens for short spoken commands, converts them into structured actions, stores those actions as events, and shows the resulting fridge and shopping status in a mobile web app.

The core product idea is not just a grocery note taker. It is a voice-first kitchen state tracker that helps users record what they added, used, finished, need to buy, or need to throw away.

## Product Goals

- Make kitchen logging fast enough to use during cooking or cleanup.
- Reduce food waste by tracking low-stock and discarded items.
- Keep a lightweight, shared household view of fridge and grocery status.
- Build a narrow but reliable spoken-command system before adding broader language support.
- Create a strong NLP dataset from real usage for future iteration.

## Non-Goals for the MVP

- Full conversational assistant behavior
- Barcode scanning or camera-based inventory recognition
- Precise nutrition tracking
- Highly accurate quantity estimation from natural language alone
- Native iOS or Android apps

## Target Users

- Individuals who cook often and want a quick way to log food status
- Shared households that need a single grocery and fridge view
- Users who benefit from hands-free interaction while cooking

## Primary Use Cases

- "Add milk to the fridge."
- "We are low on eggs."
- "Throw away the spinach."
- "Put yogurt on the shopping list."
- "What do we need to buy?"
- "What is expiring this week?"

## Core Product Principles

- Voice-first, but not voice-only
- Fast correction path on mobile
- Event history as the source of truth
- Narrow command coverage with high reliability
- Privacy-aware design, favoring local processing where practical

## Functional Requirements

### Voice Input

- Detect a wake word on Raspberry Pi
- Capture short speech commands with low latency
- Transcribe commands into text
- Ask for confirmation when confidence is low

### NLP Understanding

- Detect the user intent
- Extract structured slots such as item name, quantity, unit, and state
- Normalize synonyms and household-specific item names
- Return a confidence score for downstream confirmation logic

### Inventory and Grocery Logic

- Record events for item actions
- Project current inventory state from event history
- Generate a shopping list from explicit requests and low-stock signals
- Flag items nearing expiration when expiry metadata exists

### Mobile Web App

- Show current inventory state
- Show shopping list
- Show recent kitchen actions
- Allow correction and deletion of incorrect events
- Support a simple shared-household model

## Proposed Intent Schema

- `add_item`
- `consume_item`
- `remove_item`
- `mark_low`
- `mark_expired`
- `throw_away`
- `add_to_buy`
- `query_status`
- `query_buy_list`
- `query_expiring`

## Proposed Slot Schema

- `item_name`
- `quantity`
- `unit`
- `location`
- `state`
- `time_ref`
- `confidence`

## Event Model

The system should store user actions as append-only events. This is more robust than mutating a single current-status table.

Suggested event types:

- `added`
- `consumed`
- `marked_low`
- `marked_expired`
- `thrown_away`
- `added_to_buy`
- `removed_from_buy`
- `corrected`

Suggested event fields:

- `event_id`
- `household_id`
- `user_id`
- `item_id`
- `event_type`
- `quantity`
- `unit`
- `raw_utterance`
- `normalized_payload`
- `confidence`
- `source` such as `voice` or `mobile`
- `timestamp`

## Suggested Data Model

### Core Tables

- `users`
- `households`
- `household_members`
- `items`
- `item_aliases`
- `events`
- `shopping_list_entries`

### Optional Derived Views or Tables

- `inventory_projection`
- `expiring_items`
- `waste_report`

## High-Level Architecture

### Edge Device

Raspberry Pi handles:

- microphone input
- wake word detection
- short audio recording
- local TTS for confirmations or responses
- sending structured requests to the backend

### Backend

Backend handles:

- authentication and household routing
- event ingestion
- NLP orchestration or validation
- inventory projection logic
- shopping-list generation
- reporting endpoints

### Frontend

The mobile web app handles:

- household dashboard
- inventory list
- shopping list
- action history
- event correction UI

## Recommended Technical Stack

### Raspberry Pi

- Wake word: `openWakeWord` or `Picovoice`
- ASR: `whisper.cpp` for accuracy or `Vosk` for lighter local inference
- TTS: `Piper`

### Backend

- `FastAPI` or `Node.js` with a REST API
- `PostgreSQL` for shared use, or `SQLite` for early prototyping
- Background tasks for reminders and notifications

### Frontend

- React-based PWA
- Mobile-first layout
- Lightweight auth and household switching

## NLP Development Strategy

Start simple. The first version should use intent classification plus slot extraction, with rule-based normalization around item names and quantities. Do not start with a broad open-ended assistant.

Recommended stages:

1. Handwritten command templates and synonym dictionaries
2. Structured intent and slot parsing with confidence scoring
3. Real utterance collection from test users
4. Iterative improvement of normalization and clarification prompts

Important NLP challenges:

- Korean and English mixed item names
- Synonyms and household-specific aliases
- Vague quantities such as "a bit" or "almost out"
- Repairing ASR errors that turn one ingredient into another

## API Outline

Suggested initial endpoints:

- `POST /events`
- `GET /inventory`
- `GET /shopping-list`
- `POST /shopping-list`
- `GET /events`
- `PATCH /events/:id`
- `DELETE /events/:id`
- `GET /reports/expiring`
- `GET /reports/waste`

## MVP Definition

The MVP should support:

- one household
- a limited command set
- basic item alias normalization
- fridge inventory projection
- shopping list management
- mobile correction flow

The MVP should not require:

- camera input
- advanced multi-turn conversation
- detailed nutrition metadata

## Milestones

### Phase 1: Data and Backend Foundation

- Define entities, events, and API contract
- Implement event ingestion
- Implement inventory projection
- Seed a small item alias dictionary

### Phase 2: Mobile Web App MVP

- Build dashboard, inventory, shopping list, and history screens
- Add event correction and deletion
- Validate the end-to-end data model without voice

### Phase 3: Raspberry Pi Voice Pipeline

- Add wake word and audio capture
- Integrate local ASR
- Map parsed commands to API requests
- Add low-confidence confirmation flow

### Phase 4: Intelligence and Reporting

- Expiring-soon reminders
- Waste tracking reports
- Improved normalization and ranking
- Better household customization

## Risks and Mitigations

### ASR Reliability in Kitchen Environments

Risk:
Background noise and distance from the microphone will reduce transcription quality.

Mitigation:
Use short commands, test in realistic kitchen settings, and add confirmation for low-confidence commands.

### Inventory Drift

Risk:
Users will forget to log some actions, so system state will diverge from reality.

Mitigation:
Favor coarse status labels such as `low` or `out`, and make mobile corrections very fast.

### Item Normalization

Risk:
One household may use many names for the same item.

Mitigation:
Support alias dictionaries and keep normalization editable.

### Overly Broad Scope

Risk:
Trying to solve full smart-kitchen automation too early will delay delivery.

Mitigation:
Keep the first release focused on a small command set and a reliable correction loop.

## Success Criteria

- A user can log common kitchen actions by voice in a few seconds.
- The phone web app reflects those actions accurately enough to be useful day to day.
- Users can quickly fix incorrect interpretations.
- The system produces a trustworthy "what should I buy" view.

## Near-Term Next Steps

1. Choose the product name to keep branding consistent across repo and app.
2. Decide the initial stack for backend and frontend.
3. Draft the event schema and API contract.
4. Build a non-voice prototype to validate the data model.
5. Add Raspberry Pi voice input after the backend and web views are stable.
