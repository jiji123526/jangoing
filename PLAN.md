# jangoing Plan

## Product Summary

jangoing is a model-first conversational kitchen intelligence system. Its primary
purpose is to train, validate, and compare language and recommendation models on
real reviewed interactions. The product converts requests found in everyday
conversation into contextual, explainable proposals for kitchen actions and
recommendations.

The project begins as a text-based product. Raspberry Pi audio and a trained language-understanding model will be added only after the command, confirmation, storage, and correction workflow has been validated.

## Product Goals

- Make kitchen inventory updates fast enough to use during cooking or cleanup.
- Track in-stock, low-stock, consumed, discarded, and shopping-list actions.
- Support an optional expiry date for individual inventory batches.
- Keep every state-changing action reviewable and correctable.
- Collect high-quality English command data for later model training.
- Log every inference and outcome by default so model progress is reproducible
  and visible across versions.
- Detect relevant requests and resolve context across natural multi-turn
  conversation, including goals, preferences, household state, and ambiguity.
- Provide explainable recommendations for meals, products, substitutions, and
  shopping deals while respecting dietary, budget, freshness, and safety rules.
- Quantify every release with frozen offline sets, slice metrics, calibration,
  latency, correction behavior, and monitored online outcomes.

## Engineering Priority

The model evaluation loop is the main system, not a later analytics feature:

```text
interaction -> versioned inference log -> user review/correction
            -> versioned dataset -> reproducible training run
            -> frozen + slice evaluation -> deployment decision
            -> production outcome monitoring -> next dataset
```

See [MODEL_EVALUATION.md](./MODEL_EVALUATION.md) for the required records,
metrics, privacy constraints, and promotion gates.

## Current Implementation Status

The text MVP is implemented and deployable:

- Next.js web app on Vercel
- Cloudflare Worker API with D1
- Local Node SQLite development API
- Shared Zod contracts
- Append-only event storage and inventory projections
- Command interpretation preview and explicit confirmation
- Optional expiry date picker
- Deterministic English parser with unit tests
- Editable interpretation review and correction records
- Versioned inference logging and reviewed JSONL export
- Reproducible 800-record English `synthetic-v1` dataset
- TF-IDF + logistic-regression single-intent baseline
- Public production `/annotate` workspace with exact spans
- `annotation-v2` multi-action groups with action-specific intent, phrase family,
  entities, and normalized values
- Controlled dropdown vocabularies for normalized values and phrase families
- Prioritized annotation queues for correction, expiry-heavy, low-confidence,
  confirmed, and evaluation-holdout samples
- Production counters for training candidates (100–200 target) and evaluation
  candidates (100+ target)
- Reviewed dataset export split into separate train/evaluation JSONL files with
  cross-split text and phrase-family leakage checks

The language layer is currently rule-based. It recognizes a small set of sentence patterns and does not represent broad natural-language understanding.

### Current Parser Limits

- Natural-language expiry phrases such as `expiring tomorrow`, `expires next Friday`,
  and `with expiry date on August twenty-eighth` are parsed, but only when the
  sentence explicitly marks them as expiry information.
- Inline ISO expiry dates still work and remain the most deterministic input form.
- Unsupported phrases may still be absorbed into `item_name`, especially when a
  date phrase appears without an explicit expiry marker.
- Supported units are limited to bag, bottle, can, carton, dozen, jar, pack, and piece.
- Number words are limited to one through ten, plus `a`, `an`, digits, and decimals.
- Item alias normalization is intentionally small.
- Pattern confidence scores are constants and are not statistically calibrated.
- Valid interpretation attempts are logged before confirmation, including pending,
  confirmed, corrected, cancelled, rejected, and annotated outcomes.

These limitations are acceptable only while every state-changing action requires user review.

### Current Data Gaps

- Synthetic generation already includes entity spans and normalized values, so
  entity-label support itself is not the blocker.
- Runtime parsing now normalizes explicit natural-language expiry phrases, but
  full reference-date/timezone persistence is still missing.
- Reviewed export now separates train/evaluation splits and supports task-aware
  filtering for `intent`, `slots`, and `joint` exports.
- `reference_date` and `timezone` are documented but not yet stored
  end-to-end in inference, annotation, and export payloads.
- Reviewed annotations do not yet enforce normalized-value completeness for
  labels such as ITEM, CATEGORY, UNIT, LOCATION, and EXPIRY_DATE.
- The single-action baseline gate is still implicit in ML code rather than a
  first-class export or annotation flag.

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
- Multi-turn conversational context and recommendation ranking in the MVP only;
  both remain core post-MVP goals.

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
- `needs_clarification`
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

Annotation records use a structured action list rather than assuming one intent:

```json
{
  "actions": [
    {"intent": "add_to_buy", "entities": [{"label": "ITEM", "text": "milk"}]},
    {"intent": "throw_away", "entities": [{"label": "ITEM", "text": "spinach"}]}
  ]
}
```

### Generalized Item and Category Understanding

Requests may refer to a product, an alias, or a broader category. For example,
`we're out of drink` should not require an inventory item literally named
`drink`. The language layer should extract the user's surface phrase and resolve
it through a versioned item taxonomy:

```text
drink -> beverage
beverage -> water, milk, juice, soda, tea, coffee, ...
```

The taxonomy must support singular/plural forms, synonyms, regional vocabulary,
brands, category hierarchies, and household-specific aliases. The system keeps
the original phrase, resolved canonical entity or category, candidate matches,
and resolution confidence in the inference log.

Category references must be grounded against context rather than expanded
blindly. For `we're out of drinks`, the system can inspect the household's known
beverage inventory and recent purchases, then either propose the relevant
category action or ask a focused clarification such as `Which drink—water,
milk, or juice?` It must not mark every beverage as out or add arbitrary products
without confirmation.

## Expiry Model

Expiry belongs to an inventory batch, not the canonical item. Two cartons of milk purchased on different days may have different expiry dates.

For the MVP, expiry can be supplied through the web date picker or an ISO date in a supported text command. The system does not infer expiry from the item type.

Derived expiry states:

- `unknown`: no expiry date
- `fresh`: more than three days remain
- `expiring_soon`: zero to three days remain
- `expired`: the expiry date has passed

Dates use `YYYY-MM-DD`. Comparisons use date-only UTC values to prevent timezone shifts.

Natural date handling will be hybrid:

1. A slot model extracts the raw date span, such as `August twenty-eighth`.
2. A deterministic date library normalizes that span using `reference_date` and `timezone`.
3. The user confirms the resulting ISO date before an event is stored.

The model must not calculate calendar dates itself.

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
- Provide a dedicated annotation-v2 screen with action selection, exact spans,
  controlled values, phrase families, dataset purpose, collection counters, and
  queue-driven sample loading

### API Responsibilities

- Validate request bodies
- Parse supported English command patterns
- Return structured interpretations
- Store confirmed events
- Build inventory and shopping-list projections
- Enforce CORS for configured web origins
- Validate and store action-group annotations
- Expose non-sensitive aggregate counts and prioritized annotation queues

### Shared Contract Responsibilities

- Define intent, slot, event, and response schemas
- Keep web and API payloads synchronized
- Reject malformed dates, quantities, or event types
- Define annotation actions, controlled vocabularies, and purpose-specific stats

## API Contract

- `POST /commands/interpret`: parse without mutating
- `POST /events`: store a confirmed state-changing action
- `GET /inventory`: return current projected inventory
- `GET /shopping-list`: return projected shopping items
- `GET /events`: return recent event history
- `GET /health`: health check
- `POST /inferences/outcome`: record reviewed non-event outcomes
- `POST /annotations`: store one-to-eight reviewed action groups
- `GET /annotations/stats`: return aggregate training/evaluation candidate counts
- `GET /annotations/queue`: return prioritized unlabeled inference samples for annotation

Future interpretation requests will include date context:

```json
{
  "text": "Add eggs expiring next Friday",
  "reference_date": "2026-08-26",
  "timezone": "America/New_York"
}
```

## Language Understanding Architecture

The target language pipeline is:

```text
English command
      |
      v
Intent classification
      |
      v
Slot span extraction
      |
      v
Date, quantity, unit, and item normalizers
      |
      v
Zod schema validation
      |
      v
User correction or confirmation
      |
      v
Append-only event
```

### Intent Model

After the TF-IDF baseline and frozen human test set, compare
`distilbert-base-uncased` sequence classification for:

- `add_item`
- `consume_item`
- `mark_low`
- `throw_away`
- `add_to_buy`
- `query_inventory`
- `needs_clarification`
- `unknown`

The first baseline remains single-intent. Multi-action records are collected now,
exported without a false first-intent label, and reserved for a later multi-label
or structured-prediction baseline.

### Slot Model

Use token classification with BIO labels:

- `B-ITEM`, `I-ITEM`
- `B-QUANTITY`, `I-QUANTITY`
- `B-UNIT`, `I-UNIT`
- `B-LOCATION`, `I-LOCATION`
- `B-EXPIRY_DATE`, `I-EXPIRY_DATE`

Example:

```text
put             O
12              B-QUANTITY
eggs            B-ITEM
with            O
expiry          O
date            O
on              O
august          B-EXPIRY_DATE
twenty-eighth   I-EXPIRY_DATE
```

### Deterministic Normalizers

The model extracts spans; normalizers convert them into domain values:

- `eggs` -> `egg`
- `twelve` -> `12`
- `cartons` -> `carton`
- `August twenty-eighth` -> `2026-08-28`

Use a date parser such as `chrono-node` with an explicit reference date. Ambiguous results require confirmation.

### Correction Data

Store both the proposed interpretation and the user's corrected interpretation. The minimum training record should include:

```json
{
  "text": "put 12 eggs with expiry date on august twenty-eighth",
  "intent": "add_item",
  "entities": [
    {
      "label": "QUANTITY",
      "start": 4,
      "end": 6,
      "text": "12"
    },
    {
      "label": "ITEM",
      "start": 7,
      "end": 11,
      "text": "eggs"
    },
    {
      "label": "EXPIRY_DATE",
      "start": 32,
      "end": 52,
      "text": "august twenty-eighth"
    }
  ],
  "normalized": {
    "item_name": "egg",
    "quantity": 12,
    "expiration_date": "2026-08-28"
  }
}
```

Raw spans and normalized values remain separate so model errors and normalization errors can be evaluated independently.

## Contextual Conversation Architecture

The final system must find actionable requests inside ordinary dialogue rather
than require command-shaped sentences. Context is structured and permissioned,
not an unbounded transcript pasted into a model.

```text
current turn + recent turns + confirmed household state + user constraints
                              |
                              v
              request detection and context retrieval
                              |
                              v
          intent, entities, goals, ambiguity, and action proposal
                              |
                              v
               clarification, confirmation, or recommendation
```

Context sources include recent conversational turns, inventory and expiry,
shopping list, dietary restrictions, preferences, goals, budget, location, and
time. Each prediction must log which context records influenced its result so a
failure can be reproduced and an explanation can be audited.

The system distinguishes among:

- an explicit state-changing request
- an implicit but sufficiently grounded request
- an informational question
- a recommendation request
- casual conversation with no kitchen action
- an ambiguous request that needs clarification

## Recommendation Architecture

Recommendation is a separate candidate-generation and ranking pipeline built on
top of contextual understanding.

1. Translate the conversation into goals and hard constraints.
2. Retrieve candidates from inventory, expiry, shopping list, preferences, and
   explicitly connected product/deal sources.
3. Filter allergens, dietary conflicts, stale deals, unavailable items, and
   budget violations.
4. Rank remaining candidates and attach evidence for the ranking.
5. Ask for confirmation before changing lists or creating purchases.
6. Log impressions, acceptance, dismissal, correction, and downstream outcomes.

Start with auditable rules and retrieval. Add learned ranking only after enough
unbiased impression and outcome data exists. The system must not train only on
clicked items because position and availability create selection bias.

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

### M4: Correction and Normalization

- Add editable interpretation fields before confirmation.
- Store original predictions and user corrections.
- Add natural English date-span normalization.
- Expand quantity, unit, and item alias normalizers.
- Record parser failures without creating inventory events.

Completion:

- A user can correct intent, item, quantity, unit, location, and expiry.
- The original utterance, prediction, correction, and parser version are retained.
- `August twenty-eighth`, `next Friday`, and `tomorrow` normalize against an explicit reference date.

### M5: Dataset Collection

- Save corrected utterances and parser failures
- Create versioned JSONL data
- Define train, validation, and test splits
- Establish intent and slot evaluation scripts

Dataset targets:

- 80 to 150 reviewed examples per intent
- 800 to 1,500 total utterances
- At least 200 expiry-date examples
- Commands with different word orders, units, politeness, and ASR-like errors
- Product aliases, unseen brands, category-level phrases, singular/plural forms,
  and ambiguous terms such as `drink`, `snack`, `greens`, or `something sweet`
- Train, validation, and test split by phrasing family rather than random template copies
- Initial UI progress targets: 100–200 human training candidates and 100+
  independent human evaluation candidates
- Preserve multi-action utterances as structured action groups

The UI targets are the first checkpoint, not M5 completion. After that checkpoint,
collection expands toward the per-intent and total coverage targets above.

Completion: every supported intent has reviewed examples and the test set contains phrasing patterns absent from training.

Current status: infrastructure and production UI are complete; human-reviewed
collection is now the active work. `synthetic-v1` supplies 800 bootstrap records
but does not satisfy the human evaluation requirement. Queue-based sample loading
and task-aware train/evaluation export are implemented. Explicit natural-date
normalization is also implemented for expiry phrases; full
reference-date/timezone capture remains open.

### M5.5: Experiment and Observability Foundation

- Log all interpretation attempts, including unknown, cancelled, and rejected
- Version model, parser, normalizer, schema, dataset, and context snapshot
- Add immutable run metadata, artifact hashes, seeds, and split manifests
- Build a comparison dashboard for aggregate, slice, calibration, and latency metrics
- Define privacy retention, deletion, redaction, and training-export policies

Completion: any production prediction and any reported experiment can be traced
to its code, model, data, configuration, context, and user outcome.

### M6: English NLP Model

- Fine-tune `distilbert-base-uncased` for intent classification.
- Fine-tune token classification for slot spans.
- Evaluate normalization separately from span extraction.
- Compare model and hybrid output against the deterministic baseline.
- Add confidence thresholds, `unknown` fallback, and confirmation policy.

Completion: intent macro-F1, entity-level slot F1, and end-to-end exact match are reported and improve over baseline.

### M7: Model Deployment

- Export compact models to ONNX.
- Benchmark latency and memory on Raspberry Pi.
- Keep Cloudflare responsible for schema validation and event persistence.
- Version every prediction with model and normalizer versions.
- Preserve deterministic fallback behavior.

Completion: the deployed pipeline meets accuracy targets without bypassing confirmation.

### M8: Raspberry Pi Voice Client

- Wake-word detection
- Local English speech-to-text
- Worker API client
- Confirmation feedback

Completion: voice input follows the same confirmed event path as web text input.

### M9: Contextual Conversation Understanding

- Detect kitchen requests inside multi-turn everyday conversation
- Resolve references and entities across turns
- Retrieve only relevant, permitted household and user context
- Represent goals, preferences, dietary constraints, budget, and uncertainty
- Resolve product mentions through a versioned item/category taxonomy, including
  aliases, brands, hierarchical categories, and household vocabulary
- Clarify category-level requests when context cannot identify a safe action
- Add clarification behavior and context-specific evaluation sets

Completion: contextual exact match and request-detection targets are met on
frozen tests containing unseen conversations, distractor turns, and stale state.

### M10: Recommendation and Deal Ranking

- Generate meal, product, and substitution candidates from grounded context
- Add constraint filtering and explainable ranking
- Integrate one deal source with freshness and provenance metadata
- Establish offline ranking benchmarks and unbiased impression logging
- Run guarded online evaluation with rollback and safety monitoring

Completion: recommendations improve user outcomes against a rules baseline
without regressing dietary safety, deal freshness, privacy, or user control.

## Testing Strategy

- Unit tests for command patterns, normalization, quantities, and expiry
- Unit tests for event projection
- API tests against local D1
- Web interaction tests
- Manual mobile viewport checks
- End-to-end tests for interpretation, confirmation, persistence, and refresh
- Frozen offline language and recommendation benchmarks
- Context, ambiguity, ASR-noise, unseen-entity, and safety slices
- Calibration, latency, drift, leakage, and rollback tests by model version

## Initial Success Metrics

- At least 90% intent accuracy on a reviewed MVP test set
- At least 90% entity-level slot F1
- At least 95% date-normalization accuracy when the date span is correct
- At least 85% end-to-end action exact match
- Zero unconfirmed state-changing actions
- A typical command can be confirmed in under five seconds
- Incorrect actions are identifiable in event history
- 100% of inference attempts carry parser/model, normalizer, schema, and context versions
- 100% of training runs carry immutable dataset splits, commit, seed, and artifact hashes
- Contextual request detection and exact-match results are reported separately
  from single-turn command results
- Entity-resolution accuracy is reported separately for exact products, aliases,
  unseen brands, and category-level references
- Recommendation releases report Recall@K, NDCG@K, constraint violations,
  coverage, deal freshness, and online accept/dismiss outcomes

## Known Risks

### Inventory Drift

Users may forget to log actions. The MVP uses coarse state and visible history rather than claiming perfect physical inventory accuracy.

### Command Ambiguity

`Add milk` could mean inventory or shopping list. The parser only selects an intent for supported patterns and otherwise returns `unknown`.

Category phrases introduce another ambiguity: `we're out of drink` may mean a
specific preferred beverage, all beverages, or a request for a recommendation.
Category resolution uses known household context and confidence thresholds; low
confidence triggers clarification instead of a broad state change.

### Batch Expiry Complexity

Multiple batches can have different expiry dates. The MVP preserves expiry on addition events and reports the nearest known expiry.

### Premature Model Training

Template-generated data can produce misleading results. Training begins after the product flow produces reviewed real-world utterances.

### Date Ambiguity

Expressions without a year depend on reference date and timezone. The system must expose the resolved date for confirmation and must not silently guess when multiple interpretations are plausible.

### Model Deployment Constraints

Cloudflare Worker code should not assume arbitrary custom-model hosting is available. The preferred long-term target is ONNX inference on Raspberry Pi or a dedicated inference service, with the Worker retaining validation and persistence responsibilities.
