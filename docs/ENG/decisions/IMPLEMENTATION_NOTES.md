# jangoing Implementation Notes

## 1. Purpose of This Document

This document records what is currently implemented in jangoing, why that
structure was chosen, which alternatives were considered, and what has not yet
been implemented. It exists so that the reasoning behind decisions does not
disappear as the code changes.

## 2. Current Project Goal

The short-term product form of jangoing is a kitchen inventory and shopping
list web app, but the core of the project is model training and evaluation. The
product UI also serves as a data-collection and evaluation environment where
users enter real expressions and review or correct the model's interpretation.

The long-term goal is not a parser that only handles commands. It needs to find
relevant requests and context inside everyday conversation such as:

- recognizing a beverage category from `We're out of drinks` rather than only a
  specific product name;
- using goals, preferences, inventory, and expiry together to answer
  `I want to lose weight. What should I eat this week?`;
- recommending deals or substitutes with validated price, location, and time
  constraints for items on the shopping list;
- asking follow-up questions rather than mutating inventory arbitrarily when
  meaning is unclear.

Those long-term features are not implemented yet. The current implementation is
the first learning loop for building reviewed data and comparable baselines
needed for that goal.

## 3. Current Runtime Structure

```text
Vercel
  └─ apps/web: Next.js web UI
          |
          v
Cloudflare Worker
  └─ apps/api: interpretation, validation, event API
          |
          v
Cloudflare D1
  ├─ events
  ├─ corrections
  ├─ inference_logs
  └─ annotations (annotation-v2 action groups)

Developer machine
  └─ ml/: data validation, splitting, model training, evaluation
```

Python is not currently deployed to Vercel or Cloudflare. `ml/` is a toolset
for running training and evaluation on the developer machine. Trained models
are not yet used to handle production requests.

## 4. Implemented Features

### 4.1 Editable Interpretation UI

The earlier UI only let users read the rule-based parser output and either
confirm or cancel it. Now the user can edit the following fields before saving:

- action/intent
- item
- quantity
- unit
- location
- expiration date

Sentences classified as `unknown` can also be recovered by letting the user
enter the correct action and values. Inventory-changing actions are still saved
only after explicit user confirmation.

Relevant files:

- `apps/web/app/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/lib/api.ts`
- `packages/contracts/src/index.ts`

### 4.2 Event Storage

The `events` table stores kitchen-state changes that were actually confirmed.
Current inventory and shopping state are calculated by replaying events. A
parser prediction does not create an event by itself.

Reasons for choosing this structure:

- incorrect model predictions should not automatically change inventory;
- the system must be able to trace which actions were actually confirmed;
- later correction events or audit history can be added more easily.

### 4.3 Correction Records

The `corrections` table stores the original prediction and the user's final
confirmed interpretation separately. Confirmations without edits are also
recorded because they are still human-reviewed answer candidates.

Relevant migration:

- `apps/api/migrations/0002_create_corrections.sql`

Key stored values:

- raw utterance
- original intent and slots
- final intent and slots
- parser version
- whether a real correction occurred
- linked event ID

### 4.4 Logging Every Valid Interpretation Attempt

The `inference_logs` table records a valid interpretation request before the
user finishes review, regardless of whether the user ultimately confirms it.
Each request receives a UUID-style `inference_id`.

Currently stored values:

- raw utterance
- request context
- predicted result
- final result when a correction exists
- parser, normalizer, and schema version
- input source
- processing latency
- pending, confirmed, corrected, cancelled, rejected outcome
- linked event ID
- created and resolved timestamps

The request context now stores not only the manual date-picker
`expiration_date`, but also the `reference_date` used for natural-language date
interpretation and the browser-provided `timezone`.

Relevant migration:

- `apps/api/migrations/0003_create_inference_logs.sql`

When the user confirms in the web UI, that inference becomes `confirmed` or
`corrected`. If the user presses cancel, it becomes `cancelled`. Event-creation
requests are accepted only when they reference a real pending inference ID.

Reasons for choosing this structure:

- if only events are stored, failures, `unknown`, and cancellations disappear;
- if failures disappear, the real error distribution of the model cannot be measured;
- correction rate and latency must be comparable across model versions;
- training data and product-behavior data must remain separable.

### 4.5 Training Data Export

`apps/api/scripts/export-dataset.ts` exports reviewed data as JSONL. The current
supervised export only includes records that have annotation or a trustworthy
reviewed outcome. `pending` and `cancelled` are excluded because they do not
contain a ground-truth answer. Instead of producing one mixed output, export now
forces separate training and evaluation files and fails if the same normalized
sentence or phrase family appears in both splits.

Export from local SQLite:

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

Export from production D1:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

The local command reads the SQLite file created by `npm run dev:api` at
`apps/api/.local/jangoing.sqlite`. `--remote` reads Cloudflare D1 through
Wrangler authentication.

Export was not exposed as a public GET endpoint because raw conversational data
would then risk being exposed on the internet. It is currently available only
through local or authenticated Wrangler commands.

The export JSONL includes not only reviewed intent/action information but also
the original `reference_date` and `timezone` from when the utterance was
interpreted. Those values are needed later to reapply natural-language date
normalization or reproduce failures.

Export now supports task-specific filtering in addition to train/evaluation
separation.

- default `--task intent`: may include reviewed corrected records
- `--task slots`: includes only rows with annotation
- `--task joint`: includes only rows with annotation
- `--require-annotation`: can force annotation-only rows even for intent export

This means corrected records without annotation can still be used for intent
training, but they are automatically excluded from entity-span supervision. The
next gap is not the filter itself but reviewed annotation completeness for
normalized values and a first-class single-action baseline gate.

### 4.6 First Intent Baseline

`ml/train_baseline.py` trains the following model:

```text
TF-IDF + Logistic Regression
```

This model currently handles only intent classification. It does not yet train
slot models for item, quantity, and related fields.

Recorded outputs:

- dataset SHA-256
- Git commit
- random seed
- Python version
- train/validation/test counts
- per-intent precision, recall, F1
- macro average
- confusion matrix
- serialized model file

Reasons for choosing TF-IDF first:

- it trains quickly on CPU without a GPU;
- it is easier to catch data or evaluation-pipeline errors;
- it becomes the reference point for measuring whether DistilBERT or another
  model actually improves results;
- it avoids jumping into a complex model too early on a small dataset and then
  misreading overfitting as progress.

### 4.7 English `synthetic-v1`

An 800-example English bootstrap dataset, multilingual-ready taxonomy, entity
spans, manifest, and automatic validator were added. The web review flow was
also extended so `needs_clarification` can be stored as a separate intent.
Detailed decisions and results are documented in
[SYNTHETIC_V1.md](../ml/SYNTHETIC_V1.md).

### 4.8 Phrase-Family-Based Data Split

`ml/src/jangoing_ml/split.py` performs grouped splitting so the same
`phrase_family` does not appear in both train and test.

For example, these sentences may just be the same template with different words:

```text
We're out of milk
We're out of eggs
We're out of juice
```

If rows are split randomly, nearly identical sentences can land in both train
and test and inflate the score. Grouped splitting was chosen to reduce that
kind of leakage.

General correction records can use heuristic families based on sentence form,
but `/annotate` records let humans choose intent-specific controlled semantic
families.

### 4.9 Production Annotation Workspace

`/annotate` is a public data-labeling workspace separated from the kitchen UI
used for the product. It stores gold labels for real English sentences:

- dataset purpose: `train_candidate` or `evaluation_candidate`
- action-specific intent and phrase family
- exact raw-utterance entity spans per action
- controlled normalized value per label
- notes describing annotation judgment

The public screen does not expose a free-browsing list of raw user utterances.
Instead, it loads one higher-priority sample from a queue when needed for the
annotation workflow. Current queue types are correction, expiry,
low-confidence, confirmed, and evaluation holdout. This reduces mass-browsing
risk while keeping data collection efficient. Quality and abuse risk from
unauthenticated writes still remain.

Relevant migrations:

- `0004_create_annotations.sql`
- `0005_add_annotation_actions.sql`

### 4.10 `annotation-v2` Multi-Action Structure

One sentence can contain multiple independent requests, so the system stores
1 to 8 actions instead of assuming a single `intent`.

```json
{
  "actions": [
    {"intent": "add_to_buy", "entities": ["milk"]},
    {"intent": "throw_away", "entities": ["spinach"]}
  ]
}
```

Each action owns its own intent, phrase family, entities, and normalized
object. The same raw span may be linked to more than one action when that is
truly necessary, but overlapping spans are not allowed inside a single action.
Legacy v1 rows are preserved, and the legacy columns on new rows store the
first action to maintain runtime compatibility. Official export uses `actions`
as the source of truth.

The current TF-IDF model is still a single-intent classifier. Multi-action
records are not distorted into a false first intent; they are excluded from
training and counted in the metrics metadata.

### 4.11 Dynamic Annotation Normalized Values

If normalized values are completely free-form, drift appears quickly. If they
are a fully fixed dropdown, real item coverage becomes too narrow. The current
design uses a compromise between those extremes.

- ITEM/CATEGORY/UNIT: suggest existing canonical values + allow direct entry of
  a new canonical value
- QUANTITY: numeric input + existing number suggestions
- LOCATION: fixed `fridge`, `freezer`, `pantry`
- EXPIRY_DATE: ISO date picker
- phrase family: fixed semantic family constrained by the selected intent

The shared-contract `AnnotationNormalizedValues` remains the initial seed list.
At the same time, the API endpoint `GET /annotations/normalized-values` reads
reviewed annotation `actions` JSON and aggregates distinct normalized values by
label. `/annotate` uses that response to build its suggestion list, and when
the annotator saves a new ITEM/CATEGORY/UNIT value it becomes immediately
reusable in the same session and in later annotation.

So a new canonical value does not wait for an approval queue. However, if the
meaning is unclear, creating a new value is forbidden. That case is treated as
an annotation-judgment problem rather than a normalized-value dictionary
expansion problem, and the span or intent should be reconsidered first.

### 4.12 Input and Progress UX

- Enter: generate sample
- Shift+Enter: newline
- Enter during IME composition: block submission
- Queue buttons: correction, expiry, low-confidence, confirmed, evaluation holdout
- Initial training-candidate target: 100 to 200
- Initial evaluation-candidate target: 100+

The counters aggregate production D1 rows by purpose and increase immediately
in the UI after saving. These targets indicate collection progress, not data
quality, intent balance, or phrase-family independence.

Reasons for separating queues:

- correction: quickly recover real-use cases where the model was wrong
- expiry: collect sentences with date expressions in concentrated form
- low-confidence: prioritize difficult utterances in an active-learning style
- confirmed: reinforce already-correct sentences from the real distribution
- evaluation holdout: separate validation-set candidates with reproducible rules

### 4.13 Production Status

- D1 migration: applied through `0005`
- Worker: `https://jangoing-api.letmetellu.workers.dev`
- frontend: existing Vercel project deploys from GitHub `main`
- Python: still local-training/evaluation only, not separately deployed

### 4.14 Natural-Language Expiry Date Normalization

`chrono-node` is used to normalize explicit expiry phrases into ISO dates. The
currently supported range is limited to sentences with clear expiry markers such
as:

- `Add milk expiring tomorrow`
- `Add eggs expires next Friday`
- `Add eggs with expiry date on August twenty-eighth`

This feature is not trying to interpret every free date phrase. If every date
expression inside a noun phrase were automatically treated as an expiration, it
would easily corrupt item spans. So parsing is only attempted when markers such
as `expiring`, `expires`, `expiry date`, or `with expiry date` are present.

### 4.15 Inventory Category Auto-Classification and User Override

The Inventory page calculates a display category automatically from item-name
keywords. That automatic value is the default so the user does not have to
enter a category manually when adding items or running fridge setup.

If the automatic classification is wrong, the user can choose one of the
following in the item's edit screen under `Category`:

- `Automatic (current auto value)`: remove the stored override and use the automatic classifier
- controlled categories such as `Produce`, `Dairy & Eggs`, `Drinks`
- `Other`: when none of the current categories fit

An enum is used instead of free text so UI grouping values do not fragment into
variants such as `Drink`, `Drinks`, and `Beverage`. If a new category is needed,
the taxonomy and enum must be expanded together.

The selected override is stored not in local storage but in the `category` of
an `item_adjusted` event. That means it stays consistent across devices and the
production database, and the latest category survives later edits to quantity,
unit, location, or expiry. When the user selects `Automatic`, the event records
an internal marker `automatic` to explicitly clear the override. Existing
adjustments or fridge-setup records that have no category value do not change
the override.

The projection result `InventoryItem.category` represents **only the user
override**. If the value is `null`, the web app applies the existing
deterministic fallback.

This category is different in purpose from the annotation `CATEGORY` entity.

- inventory category override: item-grouping metadata for the product UI
- annotation `CATEGORY`: a higher-level concept that actually appears in the utterance, such as `drinks` or `fruit`

Separating them does not mean inventory overrides are discarded from taxonomy
learning. The two values should be preserved as different supervision signals
and linked later in the catalog layer.

Example:

```text
Utterance: "We're out of Coke Zero."
Annotation: ITEM("Coke Zero") -> coke_zero
Inventory override: coke_zero -> drinks
```

In this sentence, the surface span `drinks` does not appear, so adding a
`CATEGORY` annotation would create an incorrect span label. But the user-chosen
`Drinks` is valid evidence for the relation `coke_zero belongs_to drinks`.

So in a future `grocery-v2`, it should be used like this:

```text
item_category_evidence
  item_id: coke_zero
  category_id: drinks
  source: user_inventory_override
  scope: household
  event_id: ...
  observed_at: ...
```

- inside the household, the user's choice applies immediately to grouping
- for the global taxonomy, it accumulates as a provenance-backed relation proposal
- annotation `CATEGORY` is only used when a real category expression appears in the utterance
- confidence increases when the same mapping is confirmed by annotation, catalog data, and external data

The current controlled enum expands category **membership coverage**, but it
does not add new category types by itself. Choosing `Other` is a taxonomy-gap
signal. If repeated `Other` selections justify a new category, that should go
through a separate `Suggest category` proposal. Free text should not be
promoted directly to a global canonical category.

Relevant files:

- `apps/api/migrations/0011_add_inventory_category.sql`
- `apps/api/src/domain/projections.ts`
- `apps/web/app/page.tsx`
- `packages/contracts/src/index.ts`

## 5. Alternatives Considered

### 5.1 Training DistilBERT From the Start

This is possible, but it was not chosen. There is still too little reviewed
data, and the data-splitting and evaluation loop has only just been built. If a
complex model is used first, it becomes hard to tell whether a high score comes
from actual model ability or from data leakage.

After the TF-IDF baseline is fixed, the plan is to compare a DistilBERT intent
classifier on the same frozen test set.

### 5.2 Using an LLM API for Every Request

This could create a natural-looking demo quickly, but it has several problems:

- results can change when the model or provider updates;
- it introduces cost and network dependency;
- exact reproduction and detailed error analysis become harder;
- a policy is needed for external transmission of personal conversation and
  kitchen data.

Long term, an LLM can still be compared as a teacher, fallback, or context
reasoning component, but version, prompt, latency, and cost must always be
recorded and compared on the same evaluation set.

### 5.3 Storing Events and Predictions in One Table

The schema would become simpler, but this option was rejected. Predictions can
fail or be cancelled, while events are actual user-approved state changes. If
those ideas are merged, failure data can disappear or unconfirmed behavior can
be mistaken for a real event.

That is why `inference_logs`, `corrections`, and `events` are separated and
linked by IDs.

### 5.4 Deploying a Separate Python API Now

A model server could be deployed with FastAPI or similar tools, but that has
not been done yet. The current model is only a baseline and there is no
evidence that it is better than the production parser. Deploying a server first
would only add operational cost and failure points.

Future deployable options:

- separate Python inference service
- local inference on Raspberry Pi after ONNX conversion
- edge inference using a supported runtime
- external model API

The choice should be made only after measuring accuracy, p95 latency, cost,
privacy, and offline requirements.

### 5.5 Random Data Splitting

This is easy to implement, but it was not chosen as the default because of
template-leakage risk. Grouped splitting by phrase family was selected, and the
final test set should not be edited during training.

### 5.6 Adopting MLflow or Weights & Biases Immediately

This would provide an experiment dashboard right away, but the project is still
at its first-baseline stage. It currently starts with local `metrics.json` and
artifact metadata. Once the number of experiments grows and multiple people
collaborate, MLflow, W&B, or a managed registry can be compared and adopted.

## 6. What Is Not Implemented Yet

The following items are in the plan but do not work yet:

- DistilBERT intent model
- slot extraction model
- a production category resolver such as `drink -> beverage`
- multi-turn conversation context retrieval
- user goals, preferences, allergy, and budget profiles
- meal or product recommendation ranking
- price and deal-provider integration
- online A/B evaluation and model-registry dashboard
- production deployment of Python models for inference
- multi-action / multi-label training baseline
- a queue with annotation edit/delete/consensus review and stronger access control

The general correction UI stores only normalized slot values, but the separate
`/annotate` screen stores exact character spans and entity labels from the raw
utterance. That data is exported later as candidate supervision for token-level
slot-model training.

## 7. Current Limits and Cautions

### Data Volume

If there is almost no reviewed data, model scores are not meaningful. The
initial UI target is 100 to 200 training candidates and at least 100
independent evaluation candidates. After that, remaining gaps should be checked
by intent, phrase family, and difficulty, and the set should expand to 250 to
400 or more.

### Privacy

`inference_logs` contains raw user utterances. Before production data is used
for training, retention periods, deletion requests, access rights, and
de-identification policy need to be defined. JSONL output is already ignored so
it is not committed to Git.

### Pending Records

If the user closes the browser or leaves the screen by entering a new sentence,
some inference rows may remain `pending`. The cancel button is recorded, but an
automatic timeout cleanup does not exist yet.

### Invalid Requests

Empty strings or malformed JSON that fail schema validation are not stored as
inferences. Operational security logs and model-training logs serve different
purposes, so such requests should later be aggregated in a separate API
observability layer.

### Atomicity

Events, corrections, and inference outcomes are logically linked, but they are
not all wrapped in one explicit database transaction yet. Before traffic and
recovery requirements grow, D1 batch/transaction strategy and idempotency keys
should be added.

## 8. How to Run It

### Web and Local API

```bash
npm install
npm run dev:api
npm run dev:web
```

### Production Migration and API Deployment

```bash
npm run db:migrate:remote
npm run deploy:api
```

If you run `npx wrangler deploy` directly, do it inside `apps/api`, not from
the repository root.

### Python Environment

Python 3.11 or newer is required.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
```

### Production Data Export and Baseline Training

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
```

Example export for slot-span experiments:

```bash
npm run dataset:export -- --remote --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

Results are written by default to `ml/artifacts/baseline/` and are not tracked
in Git.

## 9. What Has Been Verified

- 11 TypeScript tests for parser, projection, and annotation schema
- full TypeScript typecheck
- Cloudflare Worker dry build
- Next.js production build
- 3 Python tests for synthetic generation, splitting, and multi-action loading
- CPU baseline training and evaluation on 20 fixtures
- inference ID issuance and cancelled-outcome storage through a real local API request
- two-action storage in local SQLite and action-specific entity/normalized JSONL export
- desktop and 390px mobile annotation UI checks
- production migration `0005`, Worker deployment, and health/stats response checks

The score produced on the fixtures is only a functional smoke test, not a real
model-performance claim.

## 10. Recommended Next Steps

1. Fix the first reproducible baseline artifact on top of `synthetic-v1`.
2. Collect 100 to 200 training candidates through `/annotate`.
3. Collect at least 100 evaluation candidates without looking at templates or model predictions.
4. Tighten normalized-value completeness rules in reviewed annotation.
5. Review distribution and duplication by intent, phrase family, and difficulty.
6. approve and separate evaluation candidates into validation and frozen test.
7. Experiment with mixing ratios between reviewed training data and synthetic data.
8. Build a slot baseline and category resolver from collected entity spans.
9. Once enough multi-action records exist, create a multi-label or structured baseline.
10. Compare DistilBERT and TF-IDF on the same frozen test set.
11. Check whether date-context visibility needs to be stronger in annotation/debugging flows.
12. Strengthen authentication, rate limiting, pending timeouts, and idempotent/atomic writes.

The principles that matter before a model name are: correctness of labels,
fairness of splits, reproducibility of experiments, and blocking any
unconfirmed state change.

## 11. Annotation AI Cost Control and Usage Logging

The OpenAI-based draft path uses `gpt-4.1-mini` by default. One `Draft with AI`
request corresponds to one model call, and the output is capped at 500 tokens.
The UI disables the button while a request is in flight to prevent repeated
clicking.

Migration `0007_log_annotation_ai_usage.sql` stores the following values per
proposal:

- `input_tokens`: actual input token count
- `output_tokens`: actual output token count
- `estimated_cost_usd`: estimated cost computed from the rates configured in code

The current calculation uses the `gpt-4.1-mini` rates of $0.40 per million
input tokens and $1.60 per million output tokens. If `OPENAI_MODEL` is changed
to another model, the price calculation must also be updated. Parser fallback
paths that do not call the API store all three fields as `null`.

The initial operational budget is $5 per month. The current account interface
does not let this project set a per-project dollar hard limit directly, so the
Worker sums `estimated_cost_usd` for the current month and blocks new draft
requests with HTTP 429 once it reaches $5. The limit can be changed with the
`OPENAI_MONTHLY_BUDGET_USD` environment variable. This is an application-level
safety guard for the annotation-draft path only; it is not an organization-wide
billing limit that blocks other API keys or other applications using the same
OpenAI project.
