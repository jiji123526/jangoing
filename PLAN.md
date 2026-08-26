# jangoing Plan

## Product Summary

jangoing is a voice-first kitchen inventory assistant. It converts short English commands into structured kitchen actions, stores those actions as append-only events, and presents current inventory, expiry, shopping-list, and activity information in a phone-friendly web app.

The project begins as a text-based product. Raspberry Pi audio and a trained language-understanding model will be added only after the command, confirmation, storage, and correction workflow has been validated.

## Product Goals

- Make kitchen inventory updates fast enough to use during cooking or cleanup.
- Track in-stock, low-stock, consumed, discarded, and shopping-list actions.
- Support an optional expiry date for individual inventory batches.
- Keep every state-changing action reviewable and correctable.
- Collect high-quality English command data for later model training.

## MVP Boundary

### Included

- One household without authentication
- English text commands
- Deterministic intent and slot parsing
- Confirmation before storing an event
- Inventory, shopping list, and recent event views
- Optional expiry date when adding an item
- Expiring-soon and expired status calculation
- Cloudflare Worker API and D1
- Next.js mobile web app on Vercel

### Excluded

- Raspberry Pi audio, wake-word detection, and speech-to-text
- A trained intent or slot model
- Multi-user authentication
- Push notifications
- Barcode or camera input
- Native mobile apps
- Automatic shelf-life prediction

## Primary User Flow

1. The user enters `Add two cartons of milk`.
2. The user optionally selects an expiry date.
3. The API returns a structured interpretation.
4. The web app displays the proposed action.
5. The user confirms or cancels it.
6. The API stores an append-only event.
7. Inventory, shopping list, and history are recalculated.

Interpretation and mutation remain separate. Parser or model output never directly modifies inventory.

## Language Schema

MVP intents:

- `add_item`
- `consume_item`
- `mark_low`
- `throw_away`
- `add_to_buy`
- `query_inventory`
- `unknown`

MVP slots:

- `item_name`
- `quantity`
- `unit`
- `location`
- `expiration_date`

Example:

```json
{
  "intent": "add_item",
  "slots": {
    "item_name": "milk",
    "quantity": 2,
    "unit": "carton",
    "location": "fridge",
    "expiration_date": "2026-09-03"
  },
  "confidence": 0.94,
  "requires_confirmation": false
}
```

Later intents include `remove_from_buy`, `update_expiry`, `query_expiring`, and `correct_event`.

## Expiry Model

Expiry belongs to an inventory batch, not the canonical item. Two cartons of milk purchased on different days may have different expiry dates.

For the MVP, expiry can be supplied through the web date picker or an ISO date in a supported text command. The system does not infer expiry from the item type.

Derived expiry states:

- `unknown`: no expiry date
- `fresh`: more than three days remain
- `expiring_soon`: zero to three days remain
- `expired`: the expiry date has passed

Dates use `YYYY-MM-DD`. Comparisons use date-only UTC values to prevent timezone shifts.

## Event Model

The event log is the source of truth. Current views are projections derived from events.

MVP event types:

- `item_added`
- `item_consumed`
- `item_marked_low`
- `item_thrown_away`
- `item_added_to_buy`

Event fields:

- `id`
- `event_type`
- `item_name`
- `quantity`
- `unit`
- `location`
- `expiration_date`
- `raw_utterance`
- `confidence`
- `source`
- `created_at`

For MVP-scale data, read endpoints replay all events. A materialized projection can be added when event volume justifies it.

## Architecture

```text
Next.js web app on Vercel
          |
          | HTTPS JSON
          v
Cloudflare Worker API
          |
          v
Cloudflare D1 event store
```

Future voice path:

```text
Raspberry Pi -> wake word -> local ASR -> Worker API
```

### Web Responsibilities

- Capture a text command and optional expiry date
- Display interpretation and confidence
- Require explicit confirmation
- Render inventory, shopping list, and event history
- Present loading, empty, validation, and API error states

### API Responsibilities

- Validate request bodies
- Parse supported English command patterns
- Return structured interpretations
- Store confirmed events
- Build inventory and shopping-list projections
- Enforce CORS for configured web origins

### Shared Contract Responsibilities

- Define intent, slot, event, and response schemas
- Keep web and API payloads synchronized
- Reject malformed dates, quantities, or event types

## API Contract

- `POST /commands/interpret`: parse without mutating
- `POST /events`: store a confirmed state-changing action
- `GET /inventory`: return current projected inventory
- `GET /shopping-list`: return projected shopping items
- `GET /events`: return recent event history
- `GET /health`: health check

## Milestones

### M0: Repository Foundation

- npm workspaces
- Shared TypeScript configuration
- Shared Zod contracts
- Setup and progress documentation

Completion: workspaces install and resolve shared contracts.

### M1: Text Command API

- Cloudflare Worker scaffold
- D1 event migration
- Rule-based English parser
- API validation and CORS
- Parser and projection tests

Completion: `We are low on milk` is parsed, confirmed, persisted, and visible through read endpoints.

### M2: Mobile Web MVP

- Command and optional expiry inputs
- Interpretation preview and confirmation
- Inventory, shopping-list, and history views
- Loading, empty, and error states

Completion: the full flow works on a phone-sized viewport and persists across refresh.

### M3: Cloud Deployment

- Production D1
- Worker deployment
- Vercel deployment
- API URL and allowed origins configured

Completion: the Vercel app reads and writes through the Worker, while unrelated origins are rejected.

### M4: Dataset Collection

- Save corrected utterances and parser failures
- Create versioned JSONL data
- Define train, validation, and test splits
- Establish intent and slot evaluation scripts

Completion: each intent has at least 80 reviewed examples, with non-template test examples.

### M5: English NLP Model

- Fine-tune `distilbert-base-uncased` for intent classification
- Train token classification for slots
- Compare against the deterministic baseline
- Add confidence thresholds and fallback behavior

Completion: intent macro-F1, entity-level slot F1, and end-to-end exact match are reported and improve over baseline.

### M6: Raspberry Pi Voice Client

- Wake-word detection
- Local English speech-to-text
- Worker API client
- Confirmation feedback

Completion: voice input follows the same confirmed event path as web text input.

## Testing Strategy

- Unit tests for command patterns, normalization, quantities, and expiry
- Unit tests for event projection
- API tests against local D1
- Web interaction tests
- Manual mobile viewport checks
- End-to-end tests for interpretation, confirmation, persistence, and refresh

## Initial Success Metrics

- At least 90% intent accuracy on a reviewed MVP test set
- At least 85% slot exact-match accuracy
- Zero unconfirmed state-changing actions
- A typical command can be confirmed in under five seconds
- Incorrect actions are identifiable in event history

## Known Risks

### Inventory Drift

Users may forget to log actions. The MVP uses coarse state and visible history rather than claiming perfect physical inventory accuracy.

### Command Ambiguity

`Add milk` could mean inventory or shopping list. The parser only selects an intent for supported patterns and otherwise returns `unknown`.

### Batch Expiry Complexity

Multiple batches can have different expiry dates. The MVP preserves expiry on addition events and reports the nearest known expiry.

### Premature Model Training

Template-generated data can produce misleading results. Training begins after the product flow produces reviewed real-world utterances.
