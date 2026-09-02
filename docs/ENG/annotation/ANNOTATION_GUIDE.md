# Production Annotation Screen Usage and Decision Record

## Purpose

`/annotate` is a separate screen for labeling real English sentences as
training and evaluation data. It is intentionally separated from the general
kitchen UI so it can focus on recording intent, exact raw-text entity spans,
normalized values, and dataset purpose accurately.

This document explains screen usage and operational decisions. For how to
decide actual intent, entity, and normalization labels, use
[ANNOTATION_CONVENTIONS.md](./ANNOTATION_CONVENTIONS.md) as the authoritative
reference.

## Access Location

```text
https://<vercel-domain>/annotate
```

You can also open it from the `Annotate` link at the top of the home screen.

The progress card at the top of the screen shows saved counts by purpose in the
production DB.

- Training candidates: initial target `100–200`
- Evaluation candidates: initial target `100+`

After each save, the counter for the selected purpose increases immediately.
Refreshing reloads the production aggregate. These targets are only an initial
data-collection guide; they do not substitute for quality or per-intent balance.

## Production-Only Operating Rules

To operate the production annotation page against one canonical DB, keep the
following rules fixed.

- Perform annotation work only on Vercel `/annotate`.
- Always seed queues into production D1 with `--remote`.
- Always use `--remote` for reviewed dataset export as well.
- `npm run dev:api` and `apps/api/.local/jangoing.sqlite` are for local
  development and debugging only, not for production annotation operations.

In practice, any data you expect to appear immediately on the production screen
must be written to production D1. Queue samples inserted only into local SQLite
do not appear on the Vercel page.

### Production-Only Command Cheatsheet

```bash
cd /home/jjiwoo/.workspace/jangoing

# production annotation queue seed
npm run annotation:seed-queues -- --remote

# import pregenerated JSONL into generated_review
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1

# production annotation queue seed with a custom mix
npm run annotation:seed-queues -- --remote \
  --correction 50 \
  --expiry 120 \
  --low-confidence 70 \
  --confirmed 40 \
  --evaluation 20

# reviewed production dataset export
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl

# optional: enable OpenAI-backed assistant drafts on production Worker
cd apps/api
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
cd ../..

# apply new D1 schema changes before deploy when needed
npm run db:migrate:remote

# API deploy after backend changes
npm run deploy:api

# Web deploy after frontend changes
git push origin main
```

Annotation page address:

```text
https://jangoing-web.vercel.app/annotate
```

## Usage Order

1. Enter a realistic English utterance directly, or load one existing inference
   sample from a queue button. On first page load, the screen auto-loads one
   `generated_review` sample by default when possible. After manual input, press
   `Enter` or `Create`. Use `Shift + Enter` for a newline.
2. Select utterance-level relevance first.
3. If relevance is `actionable`, select the first action intent using the
   rule-based parser prediction as a reference.
4. If the sentence contains another separate request, use `Add action` and
   choose its intent.
5. Activate the action you want to label, then drag the entity words in the raw
   utterance.
6. Choose one of ITEM, CATEGORY, QUANTITY, UNIT, LOCATION, or EXPIRY_DATE.
   ITEM_CONDITION remains only for compatibility with older data and is not
   used in default new labeling.
7. Choose canonical or normalized values from the real dropdown for each label.
   ITEM, CATEGORY, and UNIT can show the full existing canonical list even on
   mobile.
8. If a related value is missing for ITEM, CATEGORY, or UNIT, choose
   `Enter a new canonical value`, type the new value into the input, and click
   `Save ...` to add it to the list. That button normalizes spaced expressions
   into lower snake case.
   Example: `oat milk` -> `oat_milk`
9. If useful, click `Draft with AI`. It immediately applies a draft of actions,
   phrase families, entity spans, and normalized values into the current edit
   state. Always inspect the raw-text highlights and the assistant summary and
   confirm manually whether edits are needed.
10. Select the intent-specific phrase family for each action.
11. Choose either Training candidate or Evaluation candidate.
12. If there is ambiguity or a specific reasoning basis for the label, record
   it in notes.
13. Click `Save annotation`.
14. If the sample came from a queue, the next sample from that same queue opens
    automatically after saving, and the page scroll resets to the top.
    If the sample was typed manually, the page tries the next sample from the
    last selected queue.

If you select `contextual_preference`, `domain_non_actionable`, or `unrelated`,
the AI draft, action, and entity steps are hidden and the record is saved with
an empty action list. Do not force an `unknown` action into these three
relevance classes.

### Assistant Draft Behavior

- `Draft with AI`
  Requests an annotation action draft based on the current sample's raw
  utterance and parser prediction, then immediately copies the proposed
  actions, entity spans, and normalized values into the current edit state.
  There is no separate Apply step.
- If a human edits the draft before saving, the system records whether the
  annotation was accepted exactly as-is (`accepted_as_is`) or saved after edits
  (`accepted_with_edits`).
- If the Worker has no `OPENAI_API_KEY`, the feature does not hard-fail. It
  returns a parser-fallback draft instead. That usually starts with one intent
  and empty entities.
- AI or provider output is only supporting information. Ground truth is always
  the saved human annotation.

### New Canonical Value Flow

- First search the real dropdown for an existing canonical value.
- Do not use native `datalist`; its rendering is inconsistent across browsers.
- If no related value exists, enter a new one. Natural-language input is
  acceptable, but the stored list should use lower_snake_case canonical form.
- Clicking the nearby `Save ...` button normalizes the current value into
  lower_snake_case and immediately adds it to this session's suggestion list.
- If the value already exists and only the format differs, the button does not
  add a new value and instead aligns to the existing canonical value.
- For expressions that should be stored, purchased, or searched as distinct
  products, such as `frozen blueberries`, `oat milk`, or `diet Coke`, label the
  full phrase as ITEM and normalize them as `frozen_blueberry`, `oat_milk`,
  and `diet_coke`.
- Do not introduce a new ITEM_CONDITION entity for temporary states or inferred
  action cues such as `spoiled`, `moldy`, `no longer usable`, `gone bad`, or
  `out of`. Keep them in the raw text and use them as training signals for
  intent and phrase family instead.

### Assistant Draft API Flow

This feature does not call OpenAI directly from the browser. The actual flow is
as follows.

1. The annotator clicks `Draft with AI` in `/annotate`.
2. The web app sends `POST /annotations/proposal` to the Worker with the
   current `inference_id`.
3. The Worker loads the utterance `raw_utterance` and the current parser
   `predicted_interpretation` from `inference_logs`.
4. If `OPENAI_API_KEY` is configured on the Worker, it calls the OpenAI Chat
   Completions API at
   `POST https://api.openai.com/v1/chat/completions`.
5. The request contains:
   - system prompt:
     rules saying the model must create a grocery-annotation draft and return
     JSON only
   - user prompt:
     `raw_utterance`, `parser_prediction`, `allowed_intents`,
     intent-specific `allowed_phrase_families`, and
     label-specific `preferred_normalized_values` collected from reviewed
     annotation
   - model:
     `OPENAI_MODEL` if present, otherwise default `gpt-4.1-mini`
   - decoding:
     `temperature: 0.2`, `response_format: json_object`
6. When OpenAI returns draft JSON, the Worker validates its structure with a
   Zod schema.
7. The model returns exact entity `text` together with zero-based `start` and
   `end` offsets. The Worker verifies
   `raw_utterance.slice(start, end) === text`; if that fails, it retries span
   restoration with exact substring search.
8. If both restoration methods fail to match the raw text, that entity is
   dropped. Phrase families not allowed for the selected intent are also
   dropped to `null`. The model should choose a phrase family that fits the
   selected intent semantically, and only return `null` when none fits
   confidently. For normalized values, it should reuse an existing canonical
   value first when available, and propose a new one only when no exact match
   exists. To keep prompt size bounded, at most 200 values per label are sent.
9. The cleaned proposal is stored in the `annotation_proposals` table.
   Stored fields include:
   `provider`, `model`, `prompt_version`, `proposal`, `note`, `status`,
   `created_at`
10. The Worker returns the cleaned proposal to the browser.
11. The web app immediately copies the proposal into the current edit state and
    highlights entity spans in the raw utterance with labels.
12. On final save, the web app can send `assistant_proposal_id` and
    `assistant_resolution` along with `POST /annotations` when applicable.
13. After the annotation is saved, the Worker marks the proposal row as
    `applied` and records `accepted_as_is` or `accepted_with_edits`.

### Fallback and Limits

- If `OPENAI_API_KEY` is absent, the Worker does not call an external AI API
  and instead creates a proposal with `provider = parser-fallback` and
  `model = rules-v2`.
- That fallback draft simply uses the current parser intent as a starting point
  and leaves entities empty.
- So the annotation screen always works, but draft quality can differ greatly
  depending on whether OpenAI is available.
- Current span restoration is based on exact substring matching. If the model
  returns an abbreviation or paraphrase that does not literally appear in the
  source text, that entity disappears automatically.
- This is intentionally conservative. It is safer for dataset quality to leave
  an entity blank and let the human relabel it than to force-save an incorrect
  span.

## Queue Buttons

In addition to creating new sentences manually, `/annotate` can load one sample
at a time from prioritized queues.

- `Load correction queue`: sentences where the user already left a correction
- `Load expiry queue`: sentences containing date or expiry expressions
- `Load low-confidence queue`: sentences with low confidence or predicted
  `unknown` / `needs_clarification`
- `Load generated review`: broad-coverage sentences imported from a pregenerated dataset
- `Load preference/context`: generated candidates about preferences, goals, or
  dietary habits that may matter later but do not create an immediate action
- `Load domain non-actionable`: generated hard-negative candidates containing
  food or cooking words but no immediate actionable inventory update
- `Load unrelated negative`: a small generated negative set outside the kitchen domain
- `Load confirmed queue`: real-use sentences that were correctly predicted and confirmed
- `Load evaluation holdout`: reviewed sentences being separated as evaluation candidates

If no queue has been selected in this browser, the page auto-loads
`generated_review` on first entry. If a previous queue was selected, the page
restores that queue from `localStorage` and auto-loads it. The selected queue
button appears active. If a queue-backed sample is being annotated, the next
sample from that same queue opens automatically after `Save annotation`, which
makes repeated labeling faster.

Samples loaded from a queue are edited based on their raw text and predicted
values. If a correction has already been stored for that sample, the reviewed
intent is reflected in the default intent selection.

The dataset metadata `Purpose` dropdown also preserves the last selection for
this browser in `localStorage`. Queue changes, annotation saves, loading the
next sample, and page refresh do not override purpose automatically. So when
working through the evaluation holdout queue, always verify that
`Evaluation candidate` is actually selected.

If you want to fill a local annotation queue quickly, you can insert
deterministic synthetic reviewed samples with:

```bash
npm run annotation:seed-queues
```

Default seed counts:

- `correction`: 36
- `expiry`: 48
- `low_confidence`: 36
- `confirmed_unannotated`: 42
- `evaluation_holdout`: 24

If `apps/api/.local/jangoing.sqlite` does not exist, this script creates it and
applies required migrations automatically. The current source is
`annotation-queue-seed-v2`. It uses a UUID namespace different from v1, and if
the same v2 ID already exists it skips with `DO NOTHING` so reviewed
provenance is never mutated. If seed semantics change, create v3 rather than
editing existing rows. To write the seed into production D1, run from the repo
root:

```bash
npm run annotation:seed-queues -- --remote
```

Note: the numbers passed here are the count of reviewed inference records
inserted by the seed, not the final visible queue counts. Queue conditions can
overlap, so a single record can appear in more than one queue.

If you want to use a pregenerated JSONL dataset as a review source, import it
into the dedicated `generated_review` queue. That keeps synthetic or
pregenerated sentences managed as a separate source rather than mixing them
into `correction` or `confirmed`.

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

Relevance-candidate JSONL can contain `relevance` instead of action intent.

```json
{"id":"pref-001","text":"I prefer oat milk in coffee.","relevance":"contextual_preference"}
{"id":"domain-001","text":"Milk has gotten expensive lately.","relevance":"domain_non_actionable"}
{"id":"neg-001","text":"The train was late again.","relevance":"unrelated"}
```

This file is imported with the same command. The importer does not save the
value directly as an annotation answer. It records only
`request_context.candidate_relevance`. `/annotate` preselects that relevance,
but it becomes `annotations.relevance` ground truth only after a human reviews
and saves it. Existing actionable JSONL files without `relevance` still go to
the normal `generated_review` queue.

The repository currently includes 600 reviewed candidates in
`relevance-candidates-v1`.

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/relevance-candidates-v1.jsonl \
  --label relevance-candidates-v1
```

Its composition is 200 preference/context, 300 domain non-actionable, and 100
unrelated. Start by piloting only 40, 60, and 20 from those groups
respectively, then inspect phrase-family ambiguity and sentence quality.
Detailed generation criteria are described in
[RELEVANCE_CANDIDATES_V1.md](./RELEVANCE_CANDIDATES_V1.md).

### How to Inspect Queue Data in D1

Queues are not stored in separate tables such as `correction_queue`. A queue is
built by querying `inference_logs` with conditions, and the seed script also
inserts queue samples into `inference_logs`.

So in the D1 UI left panel it is normal to see only **table names** such as
`annotations`, `corrections`, `events`, and `inference_logs`. That view is only
the schema browser. Queue rows must be inspected through SQL.

To verify seeded rows first in the production D1 SQL editor:

```sql
SELECT COUNT(*) AS seeded_rows
FROM inference_logs
WHERE source = 'annotation-queue-seed-v2';
```

To view recent seed rows:

```sql
SELECT id, raw_utterance, source, outcome, created_at
FROM inference_logs
WHERE source = 'annotation-queue-seed-v2'
ORDER BY created_at DESC
LIMIT 20;
```

To compare v1 and v2 together:

```sql
SELECT source, COUNT(*) AS count
FROM inference_logs
WHERE source LIKE 'annotation-queue-seed-v%'
GROUP BY source
ORDER BY source;
```

v1 annotations are preserved as-is. If you want to remove still-unannotated v1
expiry candidates from the production queue and review only v2, first verify
that v2 seed rows were inserted correctly, then delete only v1 proposals and
unannotated inferences.

```sql
DELETE FROM annotation_proposals
WHERE inference_id IN (
  SELECT il.id
  FROM inference_logs il
  LEFT JOIN annotations a ON a.inference_id = il.id
  WHERE il.source = 'annotation-queue-seed-v1' AND a.id IS NULL
);

DELETE FROM inference_logs
WHERE source = 'annotation-queue-seed-v1'
  AND id NOT IN (SELECT inference_id FROM annotations);
```

To check correction-queue candidate count:

```sql
SELECT COUNT(*) AS correction_candidates
FROM inference_logs il
LEFT JOIN annotations a ON a.inference_id = il.id
WHERE a.id IS NULL
  AND il.outcome = 'corrected'
  AND il.corrected_interpretation IS NOT NULL;
```

### Meaning and Purpose of Each Queue

#### `correction queue`

- Input data:
  sentences from `inference_logs` where `outcome = corrected` and annotation
  does not yet exist
- Current sample character:
  real production error cases where the model was wrong and the user already
  left a better interpretation
- Main purpose:
  recover intent and slot errors quickly and increase error density in the
  supervised dataset
- Caution:
  if this queue dominates, the dataset becomes too biased toward
  “sentences where the model failed”

#### `expiry queue`

- Input data:
  unannotated sentences whose raw utterance contains expiry or date signals such
  as `expire`, `best by`, `tomorrow`, `next friday`, or month names
- Current sample character:
  sentences where date spans, expiry expressions, and natural-language date
  normalization matter
- Main purpose:
  concentrate slot-training candidates that improve `EXPIRY_DATE` entity quality
  and date normalization
- Caution:
  not every sentence with an expiry signal has the same action. A sentence
  about adding a new item may be `add_item`, one about changing existing expiry
  metadata may be `update_expiry`, and one about discarding because something
  expired may be `throw_away`. Humans still need to finalize the true intent
  and entity span.
  Expiry-queue samples show a `Temporal context` card containing the original
  inference reference date, timezone, timestamp, and server-computed ISO
  suggestion. The `Apply parsed expiry date` helper uses this stored context,
  not the current annotation date. First create the exact `EXPIRY_DATE` span,
  then apply the value only after verifying it against the raw phrase and the
  reference date.

#### `low-confidence queue`

- Input data:
  unannotated sentences where parser confidence is low or the predicted intent
  is `unknown` or `needs_clarification`
- Current sample character:
  the utterances the model finds most confusing, including border cases and
  ambiguity cases
- Main purpose:
  gather active-learning-style dataset candidates that improve the intent
  classifier and fallback policy most efficiently with relatively little
  annotation
- Caution:
  this queue overrepresents difficult utterances and does not reflect the true
  production distribution

#### `generated review`

- Input data:
  unannotated sentences imported from a pregenerated JSONL dataset through
  `annotation:import-generated`
- Current sample character:
  synthetic or pregenerated review candidates for quickly broadening coverage
- Main purpose:
  provide an annotation source when it is hard to invent sentences manually and
  quickly expand intent coverage and surface variety
- Caution:
  this queue is not actual user traffic. It includes both how the parser
  currently interprets the sentence and the pregenerated reference intent, but
  that reference must never be treated as absolute truth. Use it for
  bootstrapping only; long term, real reviewed data should dominate.

#### `preference/context`

- Input data:
  unannotated generated-review rows whose `candidate_relevance` is
  `contextual_preference`
- Current sample character:
  candidates about preferences, diet, goals, or household context that may be
  useful in later conversation but do not create an immediate inventory action
- Main purpose:
  train a relevance classifier that separates actionable commands from
  longer-term context
- Caution:
  the candidate label is only a generator suggestion. If there is a real
  request or state-changing report, change it to `actionable`.

#### `domain non-actionable`

- Input data:
  unannotated generated-review rows whose `candidate_relevance` is
  `domain_non_actionable`
- Current sample character:
  hard negatives that include food, price, cooking, or meal talk but no
  immediately executable action
- Main purpose:
  prevent lexical shortcuts where grocery words alone trigger an action
- Caution:
  if the core meaning is better preserved as preference or later-useful
  context, change it to `contextual_preference`.

#### `unrelated negative`

- Input data:
  unannotated generated-review rows whose `candidate_relevance` is `unrelated`
- Current sample character:
  fully negative examples unrelated to kitchen, food, or household preference
- Main purpose:
  verify the relevance classifier's outside-domain rejection boundary
- Caution:
  if easy unrelated examples are overproduced, they can inflate evaluation
  scores. Keep this queue smaller than domain non-actionable.

#### `confirmed queue`

- Input data:
  sentences where `outcome = confirmed`, a reviewed interpretation exists, and
  annotation does not yet exist
- Current sample character:
  normal real-use sentences where the model prediction was already correct and
  the user confirmed it unchanged
- Main purpose:
  reduce collection bias caused by overfocusing on correction or low-confidence
  cases and reinforce data closer to the actual production distribution
- Caution:
  it can contain many “easy” sentences, so using only this queue weakens the
  challenge set

#### `evaluation holdout`

- Input data:
  reviewed (`confirmed` or `corrected`) but still unannotated sentences that
  matched the deterministic holdout bucket rule
- Current sample character:
  validation or evaluation candidates intentionally separated from training
- Main purpose:
  accumulate independent evaluation candidates early from the production flow,
  so they can later be approved into validation or a frozen test set
- Caution:
  the queue does not override the last dataset-purpose selection. When
  reviewing this queue, verify that `Evaluation candidate` is selected. This
  also does not mean the row is automatically approved as final test data.

### Relationship Between Queues and the Dataset

- `correction`, `expiry`, `low-confidence`, and `confirmed` are mainly
  **training-candidate sources**
- `generated_review` is a **bootstrapping training-candidate source**
- the three relevance queues are **generated training-candidate sources for the
  relevance classifier**. Their preselected labels are not human ground truth.
- `evaluation holdout` is basically an **evaluation-candidate source**
- the actual split is determined not by the queue name but by the
  annotator-chosen `dataset purpose` at save time and later export validation
- so even if a sample was loaded from one queue, it can still be saved under a
  different purpose after review, but unless there is a strong reason, staying
  consistent with the queue’s default role is usually better

### Limits of Seed and Synthetic Queue Data

Queue seed and synthetic data are useful for starting annotation and validating
the UI workflow, but they have a major limit: **if too many sentences come from
the same template family, the model can memorize the outer sentence shell
instead of learning the structure**.

Operating principles:

- treat seed and synthetic data as annotation bootstrapping and smoke-test tools
- shift the center of actual training data gradually toward reviewed real utterances
- keep mixing `confirmed` queue data and actual correction traffic to recover
  more realistic production distribution
- use reviewed evaluation holdout and frozen sets, not synthetic data, for final evaluation

## Labeling Multiple Intents and Actions

`annotation-v3` stores utterance-level relevance first, and stores action
groups only for `actionable` utterances.

```text
Add milk to the list and throw away the spinach.
```

- Action 1: `add_to_buy`, entity `milk`
- Action 2: `throw_away`, entity `spinach`

Each action has its own intent, phrase family, entities, and normalized object.
Before adding an entity, always verify that the correct action is active. If
the same raw span truly belongs to both actions, you may select it once per
action. Inside one action, spans cannot overlap.

If there is one real action with multiple objects, keep it as one action when
possible. But if separate resolution or separate gold answers are needed, you
may create multiple actions with the same intent. If the judgment is difficult,
leave the reasoning in notes.

## Storage Structure

Migration `0004_create_annotations.sql` creates the `annotations` table,
`0005_add_annotation_actions.sql` adds action-group storage fields,
`0006_create_annotation_proposals.sql` adds the AI-draft proposal table, and
`0008_add_annotation_relevance.sql` adds utterance-level relevance.

Stored values:

- linked inference ID
- relevance
- final intent and phrase family for each action
- entity label, character start/end, raw text, and normalized value for each action
- normalized object for each action
- train/evaluation candidate split
- phrase family
- notes and annotator
- annotation schema version (`annotation-v3`) and created time
- linked assistant proposal ID and acceptance result when applicable

The same inference can only be annotated once. The API revalidates that entity
spans actually match the raw utterance and that spans do not overlap.

## Public Production Screen Decision

At the user's request, the page is exposed publicly in production without
login. This has several risks:

- a third party can save arbitrary annotations
- malicious or low-quality labels can be mixed into the data
- API call volume and D1 write volume can increase

To reduce risk, the system does not provide a public free-browsing screen over
existing production utterances. Instead, it loads only one high-priority sample
from a queue when needed by the workflow. Public stats return only aggregate
saved counts, not a paginated browser of raw conversation text.

If real usage grows, the system will need authentication, rate limiting,
CSRF/abuse protection, annotator identity, and review status.

## Training and Evaluation Candidates

### Training Candidate

A candidate sentence that the model is allowed to learn from. It may include
similar phrasings and intentional variations.

### Evaluation Candidate

An independent candidate real utterance used to evaluate generalization. Do not
put in a sentence that only swaps words in an existing template. Marking a row
as a candidate does not immediately make it part of a frozen test set. It still
needs deduplication and human review before it becomes part of a separate
frozen-test manifest.

## Entity Span Rules

- Select only the exact characters that visibly appear in the raw text.
- Exclude surrounding whitespace and punctuation unless they carry meaning.
- Even if browser double-click selection captures trailing whitespace, the UI
  trims leading and trailing whitespace automatically before saving.
- Do not create overlapping spans.
- A newly added entity card appears immediately at the top of the current
  action's entity list.
- Use CATEGORY rather than ITEM for higher-level concepts such as `drinks`.
- Use canonical IDs for normalized values.

## Normalized Value Input Method

`annotation-v4` uses different input methods by label.

- ITEM, CATEGORY, UNIT: suggest existing canonical values + allow direct entry of new values
- QUANTITY: numeric input + existing numeric suggestions
- LOCATION: `fridge`, `freezer`, `pantry` as supported by the API contract
- EXPIRY_DATE: date picker that produces an ISO date

For ITEM, CATEGORY, and UNIT, the annotator can enter a new canonical value
immediately even if the suggestion list has no matching entry. Use lower-case
English `snake_case` whenever possible. After saving, that value becomes
available automatically in later annotation suggestions.

Do not create a new value just because the list does not contain one if the
meaning itself is uncertain. In that case, it is better to reconsider the span
or intent and leave the reasoning in notes than to save a wrong normalized
value.

## Phrase Family Selection Menu

Phrase family is not free text. It is chosen from a controlled list matching
the currently selected intent. If the intent changes, the previous family
selection is cleared automatically. The menu uses names humans can understand
instead of internal generator labels such as `template-01`. The API also
validates the intent-family pair, so arbitrary strings outside the menu are not
saved for new annotation.

Examples:

- `We're low on milk` -> `state_low_on_entity`
- `We're out of drinks` -> `mark_out` intent + `state_out_of_entity`
- `Add milk to the list` -> `explicit_add_to_list`
- `Do we have milk?` -> `yes_no_inventory_query`
- `Put that on the list` -> `unresolved_reference`

If no family fits, do not force a near miss. Leave it empty, record the new
family candidate in notes, and extend the shared contract and convention
together later.

Example:

```text
Text: We're almost out of drinks
Span: drinks
Label: CATEGORY
Normalized value: beverage
```

## Dataset Export

To export production annotation:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

To export all four reviewed labels for the relevance classifier:

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

`--task relevance` uses only records that actually have saved annotation and
preserves `actionable`, `contextual_preference`, `domain_non_actionable`, and
`unrelated`. Non-actionable records export as `actions: []` and `intents: []`.
By contrast, `intent`, `slots`, and `joint` tasks exclude non-actionable
records so they are not accidentally turned into `unknown` action training data.

The export includes relevance, entity spans, normalized slots, dataset purpose,
and phrase family.
If the same phrase family or exact sentence appears in both splits, export
fails. Because this is raw data, do not commit it to Git.

## Required Work Before Deployment

```bash
npm run db:migrate:remote
npm run deploy:api
```

Then redeploy the existing Vercel project. If migrations 0004 and 0005 are not
applied, annotation save and stats lookup fail.

Production D1 currently has migrations through 0005 applied, and the Worker API
is already deployed. The frontend deploys to the existing Vercel project
through GitHub `main`.

## Validation Record

- 11 TypeScript tests passed
- 3 Python ML tests passed
- full typecheck passed
- Worker dry build passed
- Next.js `/annotate` static production build passed
- real SQLite multi-action annotation save passed
- per-action ITEM-span raw-text validation passed
- JSONL export passed for `intents`, `actions`, and per-action normalized objects
- desktop and 390px mobile action-card UI validation passed
- production `/health` and purpose-specific `/annotations/stats` responses verified

## Future Improvement Options

- login and role-based annotator permissions
- stronger queue management screen with access control and audit history
- two or more independent annotations plus adjudication
- annotation edit/delete and audit history
- keyboard shortcuts and token-level selection
- duplicate and near-duplicate sentence warnings
- detailed progress dashboard by intent and entity
- frozen evaluation-set approval workflow

Protected queues are not added without authentication, because they could
expose existing raw conversation text to third parties.
