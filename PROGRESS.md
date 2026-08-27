# jangoing Progress Log

Add new entries at the top of the log so the latest state is easy to find.

## Current state as of 2026-08-27

- `main` includes annotation-v2 multi-action collection, prioritized annotation
  queues, deterministic queue seeding, generated-review dataset import, split
  train/evaluation dataset export validation, task-aware reviewed export
  filtering, dynamic normalized-value suggestions, and assistant-draft proposal
  plumbing.
- `/annotate` now auto-loads one `generated_review` sample on first page entry
  so annotation can start immediately from pregenerated coverage data.
- After each successful save, `/annotate` now automatically opens the next item
  from the current queue, or falls back to `generated_review` after manual-entry
  annotations.
- After each successful save, `/annotate` also resets the page scroll to the top
  so the next sample starts at the beginning of the workflow.
- Freeform normalized-value dropdowns now show only actual canonical values, and
  new ITEM/CATEGORY/UNIT values can be added inline with a `Save ...` helper.
- Newly added entity cards now appear at the top of the current action group
  instead of being reordered to the bottom by text span position.
- Browser text selection in `/annotate` now trims leading and trailing
  whitespace before creating an entity span, so double-click word picks do not
  accidentally save the following space.
- `mark_out` / `item_marked_out` now exist as first-class runtime actions, so
  `we have no milk` can drive an explicit inventory-to-zero update instead of
  being forced into clarification-only handling.
- The annotation convention now includes explicit overlap-resolution rules for
  phrase families such as `finished_item_report` vs `state_out_of_entity` and
  category-level `add_to_buy` vs `vague_category_request`.
- Korean docs now describe the exact assistant-draft API path from browser to
  Worker to OpenAI and back to `annotation_proposals` / `annotations`.
- Production D1 migrations are confirmed through 0005. Migration 0006 and
  redeploy are required before production can persist assistant proposals.
- Production Worker is deployed at `https://jangoing-api.letmetellu.workers.dev`.
- Vercel remains connected to `main` for the existing frontend deployment.
- Recent validation target for this branch: API tests, repo-wide typecheck, and
  web build after the assistant-draft update.
- Active work: collect 100–200 human training candidates and 100+ independent
  evaluation candidates, monitor canonical drift in newly added normalized
  values, measure whether assistant drafts materially speed up annotation, and
  build the first slot-training dataset and baseline.
- Current production counts were 0 training and 0 evaluation candidates at the
  last verified stats request.

## 2026-08-27 - Assistant-driven annotation draft flow added

### Completed

- Added `annotation_proposals` storage via migration `0006_create_annotation_proposals.sql`.
- Added `POST /annotations/proposal` to both the Cloudflare Worker and local
  Node API.
- Added `OPENAI_API_KEY` / `OPENAI_MODEL` support for Worker-side draft
  generation with a deterministic parser fallback when the key is absent.
- Added `/annotate` UI controls to request a draft, apply it, and record whether
  the saved annotation matched the draft or was edited first.
- Hardened proposal materialization so invalid phrase families are dropped
  instead of failing the whole draft.
- Documented the new production setup and annotation rules for assistant drafts.

### Decisions

- Keep AI proposals separate from final annotations so the reviewed annotation
  remains the only ground truth row used for training export.
- Do not block annotation when AI is unavailable; return a parser-based fallback
  so the UI path stays usable.
- Record assistant acceptance only when the annotator explicitly applies the
  draft, not merely because a proposal was generated.

### Next

- Apply migration 0006 to production D1 and redeploy the Worker and web app.
- Evaluate whether span prefill quality is good enough to justify continued API cost.
- Add lightweight analytics later if you want per-provider acceptance rate,
  edit distance, or annotator throughput comparisons.

## 2026-08-27 - Phrase family overlap rules clarified

### Completed

- Added explicit overlap-resolution rules to `ANNOTATION_CONVENTIONS_KO.md` for
  the most ambiguous phrase-family boundaries.
- Clarified `finished_item_report` vs `mark_low` vs `state_out_of_entity`.
- Clarified `consumed_item_report` vs `used_item_report` vs `quantity_consumed`.
- Clarified shopping-related boundaries such as `explicit_add_to_list`,
  `purchase_request`, `need_to_buy`, and `shopping_reminder`.
- Clarified that category-only requests can still be `add_to_buy` when an action
  verb such as `add`, `put on the list`, or `buy` is explicit.

### Decisions

- Prefer explicit action verbs over coarse entity type when separating
  `add_to_buy` from `needs_clarification`.
- Keep `We're out of ...` conservative as a `mark_out > state_out_of_entity`
  observation unless the utterance clearly states a completed consumption event.

### Next

- Revisit these boundaries after more real annotations accumulate and check
  whether any family should split or merge based on disagreement patterns.

## 2026-08-27 - Out-of-stock action promoted to first-class runtime behavior

### Completed

- Added `mark_out` to the shared intent contract and `item_marked_out` to the
  event contract.
- Updated the parser so `we're out of milk`, `we have no eggs`, and similar
  zero-inventory statements resolve to `mark_out`.
- Updated event confirmation flows to map `mark_out` into a persisted
  `item_marked_out` event in both the production Worker and local dev server.
- Updated inventory projection so `item_marked_out` clears remaining batches and
  forces status `out`.
- Moved `state_out_of_entity` from `needs_clarification` to the `mark_out`
  phrase-family set.
- Updated annotation, plan, README, and ML concept docs to reflect the new
  intent.

### Decisions

- Treat `mark_out` as a state observation, not a consumption event. `We have no
  milk` and `We finished the milk` can both end at zero inventory but should not
  share the same intent.
- Keep `mark_out` confirmation-required because it forces inventory to zero and
  is therefore a high-impact state change.

### Next

- Add multi-action runtime execution later for utterances such as `We're out of
  milk, add it to the list` so both `mark_out` and `add_to_buy` can be confirmed
  together from one interpretation.

## 2026-08-27 - Assistant API flow documented

### Completed

- Added a Korean explanation of the assistant-draft API path to
  `ANNOTATION_GUIDE_KO.md`.
- Documented that the browser only calls the project Worker, not OpenAI
  directly.
- Logged the exact proposal lifecycle: Worker lookup from `inference_logs`,
  optional OpenAI request, span reconstruction, `annotation_proposals` insert,
  `Apply AI draft`, and final `accepted_as_is` / `accepted_with_edits` update.
- Documented parser fallback behavior and the conservative exact-substring span
  reconstruction rule.

### Decisions

- Keep the OpenAI integration server-side so the browser never needs the API key.
- Treat dropped unmatched spans as safer than guessed offsets because training
  label precision matters more than aggressive recall in this stage.

### Next

- After production migration 0006, verify one end-to-end proposal row in D1 and
  confirm that `status`, `resolution`, and `applied_annotation_id` update as expected.

## 2026-08-27 - Generated review auto-load enabled

### Completed

- Updated `/annotate` to automatically load one `generated_review` queue item on
  first page entry.
- Documented that pregenerated review is now the default starting queue for a
  fresh annotation session.

### Decisions

- Auto-load only once on initial page entry instead of forcing a queue reload
  after every save.
- Keep manual queue buttons unchanged so the annotator can immediately switch to
  correction, expiry, confirmed, or evaluation-focused work.

### Next

- If this default proves too repetitive, add a user-selectable default queue
  preference later.

## 2026-08-27 - Auto-advance after annotation save enabled

### Completed

- Updated `/annotate` so a successful save immediately loads the next sample
  from the same queue when the current sample came from a queue.
- Added a fallback so manual-entry annotations automatically continue with the
  next `generated_review` sample when available.
- Documented the new auto-advance behavior in the Korean annotation guide.

### Decisions

- Continue within the current queue by default because that preserves the
  annotator's active workflow better than always jumping back to a single queue.
- Reset to an empty editor only when no next sample is available in the chosen
  queue.

### Next

- If annotators need a pause point, add a toggle later for auto-advance on/off.

## 2026-08-27 - Normalized value add-to-list flow simplified

### Completed

- Changed freeform normalized-value datalist options to display only the actual
  canonical value string.
- Added an inline `Save ...` helper button for ITEM, CATEGORY, and UNIT
  normalized values.
- The helper now converts entered text into lower_snake_case before saving it to
  the current session's suggestion list, for example `oat milk` -> `oat_milk`.
- Added client-side validation so freeform normalized values must be stored in
  lower_snake_case before annotation save.
- Updated the Korean annotation guide and conventions with the new UI flow and
  canonical-format rules.

### Decisions

- Keep the add-to-list action inline next to the input so annotators do not need
  a separate admin screen just to grow the canonical vocabulary.
- Show only canonical values in suggestions because mixing display labels with
  stored values made duplicates look worse than they really were.

### Next

- If annotators still create near-duplicates, add similarity warnings such as
  showing close existing values before saving a new canonical value.

## 2026-08-27 - Generated review queue added

### Completed

- Added a dedicated `generated_review` annotation queue for pregenerated JSONL datasets.
- Added `annotation:import-generated` for local or remote import of pregenerated review candidates.
- Imported records now store parser prediction and pregenerated reference interpretation together in `inference_logs`.
- Updated `/annotate` with a `Load generated review` button and queue notice.
- Documented that pregenerated data should bootstrap coverage, not replace real reviewed traffic.

### Decisions

- Keep pregenerated data in its own queue instead of mixing it into `correction` or `confirmed`.
- Treat `correction`, `confirmed`, and `evaluation_holdout` as actual-user queues.
- Use pregenerated references as annotation starting points, not as unquestioned final truth.

### Next

- Consider entity prefill from pregenerated references if annotation speed becomes the main bottleneck.
- Later, add dataset-label filters if multiple pregenerated corpora need to coexist in production.

## 2026-08-27 - Deterministic annotation queue seeding added

### Completed

- Added a deterministic queue-seeding generator for correction, expiry,
  low-confidence, confirmed, and evaluation-holdout annotation queues.
- Added a local/remote seeding script at
  `apps/api/scripts/seed-annotation-queues.ts`.
- Added root and API workspace commands so queue seed data can be created with
  one npm command.
- Made the local seeding path auto-create the SQLite database and apply
  migrations through 0005 when needed.
- Documented how to prefill queue data for annotation sessions.
- Documented the production-only annotation rule: Vercel `/annotate` must be
  paired with remote seeding and remote export, not local SQLite.
- Added a production-only command cheat sheet for multi-laptop annotation
  workflow.
- Documented how to inspect queue seed rows in D1 and clarified that queues are
  derived from `inference_logs`, not stored as separate tables.
- Documented that seed/synthetic data are bootstrap aids and should not remain
  the dominant long-term training distribution.

### Decisions

- Seed `inference_logs` directly because queue loading only depends on reviewed
  inference state, not on events or annotations.
- Keep seed IDs deterministic and stable so reruns refresh the same namespace
  instead of creating unbounded duplicate traffic.
- Leave previously annotated seeded rows intact; reruns upsert the same reviewed
  examples rather than deleting rows that may already have annotation history.

### Next

- If the curated seed traffic starts feeling repetitive, add a v2 seed set with
  more lexical variety while keeping the same queue semantics.
- Use the seed script mainly for annotation bootstrapping and UI workflow
  testing, not as a substitute for real reviewed user traffic.

## 2026-08-27 - Dynamic normalized annotation values added

### Completed

- Added `GET /annotations/normalized-values` for both the Worker and local API.
- Merged shared seed values with distinct normalized values already present in
  reviewed annotations.
- Updated `/annotate` so ITEM, CATEGORY, and UNIT can reuse suggestions or
  accept new canonical values directly.
- Kept LOCATION constrained to contract values and EXPIRY_DATE constrained to
  the ISO date picker.
- Updated annotation docs to replace the old "leave blank and propose later"
  workflow with immediate canonical-value entry.

### Decisions

- Use shared contracts only as the seed vocabulary, not the full long-term
  closed list for item-style labels.
- Let reviewed annotation history grow the reusable vocabulary automatically
  instead of creating a separate approval queue first.
- Keep strict controls for LOCATION and EXPIRY_DATE because they must remain
  aligned with product contract semantics, not annotator creativity.

### Next

- Add monitoring or lightweight review for canonical drift such as duplicate
  forms (`oatmilk` vs `oat_milk`) once more real data accumulates.
- Consider surfacing normalized-value search or taxonomy cleanup tools if the
  dynamic list grows noisy.

## 2026-08-27 - Reference date and timezone persistence added

### Completed

- Added optional `timezone` to the interpret request contract.
- Sent the browser timezone with each text interpretation request.
- Stored both `reference_date` and `timezone` in inference-log request context.
- Included `reference_date` and `timezone` in reviewed dataset export records.
- Added export tests covering request-context persistence.

### Decisions

- Persist timezone now even before using it deeply in normalization so reviewed
  datasets keep enough context for later reprocessing and audits.
- Keep annotation records linked to inference context through `inference_id`
  instead of duplicating the same date metadata into a second table right now.

### Next

- Surface date-context metadata in annotation and debugging workflows when needed.
- Use timezone-aware evaluation once natural-date coverage expands beyond the current expiry-only parser.

## 2026-08-27 - Natural-language expiry normalization added

### Completed

- Added `chrono-node`-based expiry parsing for explicit phrases such as
  `expiring tomorrow`, `expires next Friday`, and
  `with expiry date on August twenty-eighth`.
- Added optional `reference_date` to the interpret request contract.
- Sent the browser's local date as the default reference date for text parsing.
- Stored `reference_date` and later `timezone` alongside request context in inference logs.
- Added parser tests covering natural and relative expiry phrases.

### Decisions

- Restrict natural-date parsing to explicit expiry markers so generic date
  phrases are less likely to be misread as expiration dates.
- Keep inline `YYYY-MM-DD` support unchanged and let an explicit date-picker
  value override any parsed natural-language expiry.

### Next

- Expand date handling beyond expiry-only phrases if the product needs it.
- Add stronger ambiguity handling for vague natural-language date expressions.

## 2026-08-27 - Task-aware reviewed export filters added

### Completed

- Added `--task intent|slots|joint` to reviewed dataset export.
- Added `--require-annotation` for intent-only runs that still want annotation-backed rows.
- Made `slots` and `joint` exports automatically require reviewed annotations.
- Added tests for task parsing and filtering of corrected-but-unannotated rows.

### Decisions

- Keep `intent` export permissive by default because corrected reviewed rows are
  still useful supervision for intent classification.
- Make `slots` and `joint` exports annotation-only because span supervision must
  not mix with reviewed rows that have no entity labels.

### Next

- Add normalized-value completeness checks for reviewed annotation exports.
- Consider a first-class single-action-only export mode for the current baseline.

## 2026-08-27 - Split reviewed dataset export enforced

### Completed

- Refactored dataset export parsing and record-building into reusable helpers.
- Changed reviewed export to require separate training and evaluation output files.
- Added leakage validation so identical normalized text or phrase families cannot
  cross training and evaluation exports.
- Added tests covering CLI arguments, split separation, duplicate IDs, and
  cross-split leakage detection.

### Decisions

- Remove the legacy single `--output` mode because it encourages accidental
  mixing of training and evaluation data.
- Fail export early when a reviewed split is empty or when leakage is detected,
  rather than silently writing a misleading dataset.

### Next

- Add task-specific export modes such as `intent`, `slots`, or `joint`.
- Add a `reviewed-only`/`require-annotation` filter for slot-supervised training.

## 2026-08-27 - Prioritized annotation queues added

### Completed

- Added queue-backed annotation sample loading to `/annotate`.
- Added correction, expiry, low-confidence, confirmed, and evaluation-holdout queues.
- Prefilled reviewed intent information when a corrected example already has a
  saved reviewed interpretation.
- Defaulted evaluation-holdout samples to `evaluation_candidate`.

### Decisions

- Do not expose a free-browsing raw-log screen; load one prioritized sample at a
  time for the annotation workflow.
- Use separate queues to balance error-focused labeling, real-distribution
  coverage, and evaluation-set collection.

### Next

- Add annotator/admin controls if queue access later needs authentication or audit history.

## 2026-08-27 - Documentation synchronized with annotation-v2

### Completed

- Updated all project Markdown files to reflect multi-action annotation-v2.
- Documented controlled values, semantic phrase families, collection counters,
  migration 0005, production Worker status, and current validation results.
- Aligned ML guidance around synthetic bootstrap training, human candidate
  collection, single-intent baseline exclusions, and frozen-set approval.
- Replaced stale setup, milestone, test-count, and next-step descriptions.

## 2026-08-27 - Annotation collection counters added

### Completed

- Added production counts for training and evaluation candidates.
- Displayed progress against the initial 100–200 training and 100+ evaluation goals.
- Updated counters immediately after a successful annotation save.
- Added responsive progress cards and documented that quantity does not replace quality.

## 2026-08-27 - Multi-action annotation-v2 implemented

### Completed

- Replaced the single intent annotation payload with one-to-eight action groups.
- Connected intent, phrase family, entities, and normalized values per action.
- Added D1 migration 0005 while preserving legacy v1 columns and records.
- Updated local and Worker APIs, reviewed-dataset export, and baseline filtering.
- Added action selection, action creation/removal, and action-specific spans to UI.

### Decisions

- Store `{ intent, phrase_family, entities, normalized }` per action.
- Allow a source span to be reused across actions but not overlap within one action.
- Do not mislabel a multi-action record with only its first intent during export.
- Exclude multi-action records from the existing single-intent baseline and log the count.
- Retain legacy columns populated from the first action for operational compatibility.

## 2026-08-27 - Annotation keyboard submission added

### Completed

- Added Enter-to-create behavior to the annotation sentence field.
- Reserved Shift+Enter for an intentional line break.
- Avoided submitting while an IME composition is active.

## 2026-08-27 - Controlled phrase families added

### Completed

- Replaced the free-text phrase-family field with an intent-specific dropdown.
- Added semantic family names for all eight current intents.
- Reset phrase family whenever the annotator changes intent.
- Added API schema validation for intent and phrase-family combinations.
- Documented how to propose a genuinely new phrase family without forcing a match.

### Decisions

- Use human-readable semantic families for real annotations instead of synthetic
  generator identifiers such as `template-01`.
- Keep phrase-family options in the shared contracts package.
- Continue allowing an empty family when no controlled option is correct.

## 2026-08-27 - Controlled normalized values added

### Completed

- Replaced free-text normalized values with label-specific dropdown menus.
- Reused grocery-v1 canonical product/category IDs and contract locations.
- Added controlled quantity and unit values, plus an ISO date picker for expiry.
- Documented the process for values that are not yet in the controlled vocabulary.

### Decisions

- Do not allow arbitrary normalized strings from the annotation UI.
- Leave a value empty and record it in notes instead of selecting a false match.
- Keep the controlled values in the shared contracts package so the UI has one
  typed source of truth.

## 2026-08-27 - Annotation convention documented (upgraded to v2)

### Completed

- Added a Korean annotation convention separate from the UI operation guide.
- Defined intent boundaries, entity span rules, ITEM/CATEGORY decisions,
  canonical normalization, phrase families, and train/evaluation candidates.
- Added conservative rules for implicit out-of-stock statements and missing context.
- Added a checklist and a versioned process for resolving future edge cases.

### Decisions

- Treat the raw utterance as immutable annotation evidence.
- Do not infer an explicit shopping-list action from `We're out of ...` alone.
- Use `needs_clarification` when the current sentence lacks enough context.
- Keep category-level expressions generalized for the later recommendation system.

## 2026-08-26 - Production annotation workspace added

### Completed

- Added a dedicated `/annotate` page linked from the kitchen dashboard.
- Added intent labeling, exact text selection, entity labels, normalized values,
  train/evaluation purpose, phrase family, and notes.
- Added D1 annotation schema with server-side span and overlap validation.
- Included annotation entities and metadata in local and remote dataset export.
- Added a non-sensitive annotation count without exposing prior raw utterances.

### Decisions

- Publish the annotation input page without login as explicitly requested.
- Do not expose an unauthenticated queue of existing conversational text.
- Treat evaluation selection as a candidate until separate frozen-set approval.

### Validation

- TypeScript tests, typecheck, Worker build, and Next.js build pass.
- A local annotation with ITEM span and normalized value persisted successfully.
- The saved span, dataset purpose, and phrase family exported to JSONL.

### Blockers

- Public write access permits low-quality or abusive annotations.
- No annotation edit, adjudication, or authenticated review queue exists yet.

### Next

- Completed later: migrations 0004 and 0005 and the Worker redeployment.
- Active: use `/annotate` to collect independent real English evaluation candidates.

## 2026-08-26 - English synthetic-v1 bootstrap generated

### Completed

- Added `needs_clarification` as a distinct intent and reviewable non-event outcome.
- Added a multilingual-ready grocery taxonomy with canonical IDs and en/ko aliases.
- Generated 800 English records across eight balanced intents.
- Added exact entity spans, normalized values, locale, phrase families, difficulty,
  source, generator version, and taxonomy version.
- Added deterministic generation, duplicate/span validation, and a dataset manifest.
- Changed grouped splitting to remain balanced by intent.

### Decisions

- Start training with English while keeping schema and taxonomy multilingual-ready.
- Use deterministic scenarios and seed for v1 reproducibility.
- Keep `unknown` separate from requests that require clarification.
- Use synthetic-v1 only for bootstrap training, never as the final human test set.

### Validation

- 800 total records; 100 per intent.
- Zero duplicate texts and zero entity-span errors.
- Grouped split test keeps phrase families isolated and all intents represented.
- TF-IDF grouped-holdout smoke Macro-F1: 0.1875 on 80 records.

### Blockers

- No real frozen human test set exists yet.
- Production correction UI does not support entity-span annotation.

### Next

- Collect real English interactions for validation and final testing.
- Review taxonomy coverage before connecting a category resolver to production.

## 2026-08-26 - First measurable model-learning loop built

### Completed

- Added default inference logging with prediction, request context, parser,
  normalizer, schema version, latency, timestamp, and outcome.
- Connected confirmed, corrected, and cancelled UI outcomes to inference IDs.
- Added reviewed JSONL export with dataset-safe local output.
- Added Python dataset validation and phrase-family grouped splits.
- Added a CPU TF-IDF plus logistic-regression intent baseline.
- Added reproducibility metadata: dataset digest, Git commit, seed, Python
  version, split counts, class metrics, and confusion matrix.

### Decisions

- Keep pending/cancelled interactions for product analysis but exclude them from
  supervised baseline exports until they receive reviewed labels.
- Prevent phrase families from crossing train, validation, and test splits.
- Keep raw data and model artifacts out of Git.

### Validation

- Eight TypeScript parser/projection tests pass.
- ML grouped-split test passes on Python 3.12.
- A 20-record fixture trains and evaluates the baseline successfully on CPU.
- A live local request records an inference ID and cancelled outcome in SQLite.

### Blockers

- Real reviewed data is not yet large enough for meaningful model metrics.
- Entity-span labeling is still required before training a slot model.

### Next

- Apply migration 0003 locally and remotely.
- Collect 250 to 400 reviewed utterances across at least two intents.
- Add span annotation and the versioned category taxonomy contract.

## 2026-08-26 - Generalized item and category language planned

### Completed

- Added category-level language such as `we're out of drink` to the model roadmap.
- Defined a versioned product taxonomy for aliases, brands, category hierarchies,
  regional terms, and household-specific vocabulary.
- Added category ambiguity, clarification, dataset coverage, and evaluation requirements.

### Decisions

- Preserve the original surface phrase separately from the resolved entity.
- Use household context and confidence thresholds instead of expanding broad
  categories into arbitrary products.
- Require confirmation before a category interpretation changes inventory or a list.

### Validation

- The requirement is represented in language schema, dataset, contextual-model,
  success-metric, and risk sections of the plan.

### Blockers

- The initial taxonomy format and canonical grocery category source are not selected.

### Next

- Define the taxonomy contract and baseline category resolver before model training.

## 2026-08-26 - Model-first north star and evaluation standard defined

### Completed

- Reframed jangoing around model training, validation, and measurable progress.
- Defined default inference, correction, experiment, latency, and outcome logging.
- Added contextual conversation understanding and explainable recommendation roadmaps.
- Added offline, slice, calibration, ranking, safety, and online evaluation metrics.
- Documented the correct monorepo-specific Wrangler deployment commands.

### Decisions

- Treat the product as the model data and evaluation environment.
- Require reproducible evidence and release gates for every model promotion.
- Keep context structured, permissioned, versioned, and auditable.
- Begin recommendations with rules and retrieval before learned ranking.

### Validation

- Documentation agrees on the north star, staged milestones, and deployment path.

### Blockers

- All-attempt inference logging and an experiment dashboard are designed but not implemented.
- Deal recommendations require an explicit external data-provider decision.

### Next

- Implement all-attempt inference logging before collecting the first model dataset.
- Apply D1 migrations and deploy the API from the API workspace.

## 2026-08-26 - Editable interpretation review added

### Completed

- Replaced the read-only interpretation preview with editable action, item,
  quantity, unit, location, and expiry fields.
- Added a correction-data migration that retains the original prediction and
  the user's confirmed values alongside the resulting event.
- Allowed unsupported commands to be recovered by selecting a valid action and
  filling in the corrected fields.

### Decisions

- Store prediction and correction snapshots separately from inventory events.
- Record confirmations that needed no edits as useful reviewed examples too.
- Version the current deterministic parser as `rules-v1`.

### Validation

- Eight parser and projection tests pass.
- All TypeScript workspaces pass type checking.
- Cloudflare Worker dry bundle and Next.js production build succeed.

### Blockers

- `None` for local development. Production requires applying migration 0002.

### Next

- Apply the correction migration to D1 and deploy the API and web app.
- Add natural English date normalization.

## Entry Template

```markdown
## YYYY-MM-DD - Short title

### Completed

- What changed

### Decisions

- Decision and reason

### Validation

- Commands, tests, or manual checks performed

### Blockers

- `None`, or a specific blocker and owner

### Next

- The next concrete task
```

## 2026-08-26 - Language limitations and model roadmap defined

### Completed

- Documented the current deterministic parser limits.
- Recorded the failure case where a natural expiry phrase becomes part of `item_name`.
- Defined the hybrid intent, slot extraction, and normalization architecture.
- Added dataset, evaluation, ONNX deployment, and Raspberry Pi milestones.

### Decisions

- Do not ask the model to calculate calendar dates.
- Extract raw expiry spans and normalize them with reference date and timezone.
- Build correction logging before training a custom model.
- Train separate DistilBERT intent and slot baselines before considering a joint model.

### Validation

- The roadmap uses the existing intent, slot, event, and confirmation contracts.
- Model and normalizer errors have separate evaluation criteria.

### Blockers

- The application does not yet provide editable interpretation fields.
- No reviewed command dataset exists yet.

### Next

- Implement the correction UI and correction data schema.
- Add deterministic English date normalization.
- Begin collecting reviewed utterances and parser failures.

## 2026-08-26 - Text MVP scaffold verified

### Completed

- Added npm workspace structure for web, API, and shared contracts.
- Added a Vercel-ready Next.js kitchen dashboard.
- Added a Cloudflare Worker API and D1 event migration.
- Added a persistent Node SQLite server for local development.
- Added English command parsing, confirmation, inventory projection, shopping-list projection, and optional expiry dates.
- Added Cloudflare and Vercel setup instructions.

### Decisions

- Use the Node SQLite server for local development and Cloudflare D1 in production.
- Keep the current parser deterministic until reviewed utterance data is available.
- Use the patched Next.js and Wrangler releases reported clean by npm audit.

### Validation

- All TypeScript workspaces pass type checking.
- Eight parser and projection tests pass.
- The Cloudflare Worker dry bundle succeeds.
- The Next.js production build succeeds.
- npm reports zero vulnerabilities.
- A local `Add two cartons of milk` command was interpreted, confirmed, persisted, and projected with expiry `2026-09-03`.
- The running web app returned HTTP 200.

### Blockers

- Wrangler's local D1 emulator cannot run in the current AgentSpace because its native `workerd` binary requires a newer GLIBC than the host provides. The local Node SQLite server avoids this limitation.
- Cloudflare and Vercel deployment still require account authentication.

### Next

- Create the production D1 database and deploy the Worker.
- Import the repository into Vercel and set `NEXT_PUBLIC_API_BASE_URL`.
- Add the Vercel origin to `ALLOWED_ORIGINS`.

## 2026-08-26 - Text MVP foundation started

### Completed

- Selected English-only language support.
- Selected Vercel for the Next.js web app.
- Selected Cloudflare Workers and D1 for the backend.
- Defined optional batch-level expiry dates.
- Started the text-command vertical slice.

### Decisions

- Use npm workspaces because npm is already available.
- Keep interpretation separate from event creation.
- Use a deterministic parser before training a language model.

### Validation

- Repository state and local Node/npm versions checked.

### Blockers

- Cloudflare and Vercel resources require setup in the user's accounts.

### Next

- Complete and verify the Worker, D1, shared contracts, and Next.js scaffolds.
