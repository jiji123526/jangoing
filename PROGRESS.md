# jangoing Progress Log

Add new entries at the top of the log so the latest state is easy to find.

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
