# jangoing

A model-first conversational kitchen intelligence project. It measures how well
language systems can recover requests and relevant context from everyday
conversation, then turns that understanding into safe inventory actions and
personalized recommendations.

Last updated: 2026-09-04

## North Star

The product is the data-collection and evaluation environment for the model.
Every parser or model version must be reproducible and quantitatively comparable.
Inference, corrections, failures, latency, confidence, dataset version, and
evaluation results are logged by default rather than added later as diagnostics.

The long-term interaction should work inside ordinary conversation, not only
commands written in a fixed format. For example:

- `I want to lose weight. What should I eat this week?` uses dietary goals,
  preferences, inventory, expiry, and recent behavior to recommend meals or items.
- An existing shopping list can be enriched with relevant deals, substitutions,
  and lower-cost bundles, with an explanation of why each result is relevant.
- `We're making pasta tonight, but I think the spinach is old` should identify
  the meal context, inspect inventory and expiry, and propose the appropriate
  action without silently mutating data.

## Current Milestone

The authenticated household product foundation, text MVP, and production
annotation workspace are implemented. Current research work is still
text-first: complete the first human-reviewed English dataset and freeze its
evaluation split before adding voice.

1. Take a reviewed production distribution snapshot and close workflow gaps.
2. Complete the 400-record workflow pilot: 300 reviewed training candidates
   and 100 independent evaluation candidates.
3. Generate only gap-targeted `synthetic-v2` candidates after that audit.
4. Reach the first human-data baseline: 1,000 reviewed training records and
   200 independently collected evaluation records.
5. Compare relevance, intent, slot, and joint-action models on frozen,
   source-aware splits before selecting a larger model.

The committed 800-record `synthetic-v1` and 600-record
`relevance-candidates-v1` corpora are annotation candidates and bootstrap data,
not ground truth. Assistant drafts remain labeling aids only. The kitchen
dashboard is the confirmed product-action flow and a source of reviewed
corrections.

## Current Product Status

Implemented:

- Mandatory Google authentication with encrypted Auth.js sessions and
  short-lived Worker app JWTs.
- Join-first onboarding: enter an existing household code or create a new
  household instead of silently creating one at login.
- Household-isolated inventory, shopping lists, app state, inference
  provenance, and member access.
- Owner-managed join codes, household name, emoji, icon color, and member list.
- Shared inventory and shopping editing for household owners and members.
- Guided fridge setup, explicit confirmation, correction logging, per-item
  categories and thresholds, expiry tracking, and out-of-stock retention.
- Home priorities including needs-attention acknowledgement, waste prevention,
  consume-first leftovers, inventory status, and contextual navigation.
- Inventory and shopping search, with category-aware inventory matching and
  direct item navigation.
- A consolidated `/dashboard` API, household projection caching, change-aware
  user identity writes, and indexed active join-code lookup.
- English/Korean documentation trees with the English progress log retained as
  the single chronological source.

The current language runtime is still deterministic and English-first. Typed
input is intentionally being validated before personalized ASR, Korean-English
code-switching, and Raspberry Pi audio are introduced.

## Next Priorities

1. Verify the latest D1 migration and dashboard optimizations in production,
   including request, row-read, and write metrics.
2. Add reviewed distribution reporting and source-aware dataset export.
3. Complete the 300/100 workflow pilot and audit span, normalization, temporal,
   relevance, and phrase-family consistency.
4. Build gap-targeted `synthetic-v2`, then train the 1,000/200 human-data
   baseline.
5. Replace the rule-only language layer with the evaluated hybrid pipeline:
   relevance, intent, spans, deterministic normalization, validation, and
   confirmation.
6. Run a single-user Korean-English code-switching and personalized ASR pilot
   only after the text benchmark is frozen.
7. Add Raspberry Pi audio and optional item-media work after their evaluation,
   privacy, upload-security, and resource-budget gates are satisfied.

## Stack

- `apps/web`: Next.js mobile web app, Auth.js Google login, deployed on Vercel
- `apps/api`: authenticated Cloudflare Worker API with household-scoped D1 storage
- `packages/contracts`: shared Zod schemas and TypeScript types
- `ml`: English dataset generation, validation, grouped splitting, and baseline training
- `pi`: future Raspberry Pi voice client

## Local Development

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer

Install dependencies:

```bash
npm install
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The web app uses `http://localhost:8787` as its default API URL.

Local development uses Node's SQLite API and stores data in `apps/api/.local/`. Production uses the same event schema through Cloudflare D1.

Every valid interpretation now receives an inference ID and logs its prediction,
versions, latency, and eventual confirmed, corrected, or cancelled outcome.

The production `/annotate` page stores `annotation-v3` relevance labels and
action groups for actionable utterances. Collection proceeds through the
300/100 workflow pilot and then the 1,000/200 first human-data baseline. These
are reviewed-data targets, not model-quality claims. The workspace can request
an assistant draft and record whether the final saved annotation matched that
draft or was edited.
Generated relevance candidates can be routed into dedicated preference/context,
domain-non-actionable, and unrelated-negative queues. Their candidate label is
only a UI preselection; the reviewed annotation remains the ground truth.
The committed `relevance-candidates-v1` corpus provides 600 such review
candidates across 35 phrase families and can be imported with
`annotation:import-generated`.

## First ML Baseline

Start with the committed reproducible synthetic bootstrap:

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
```

After human annotations exist, export training and evaluation candidates to
separate files:

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
```

For slot or joint training data, require annotation-backed rows:

```bash
npm run dataset:export -- --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

For utterance-level relevance classification, export all four reviewed
relevance classes:

```bash
npm run dataset:export -- --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

Relevance exports may contain actionless records. Intent, slot, and joint
exports include only `actionable` records so non-actionable language is not
misrepresented as an `unknown` inventory action.

The baseline writes a model plus versioned metrics including the dataset digest,
Git commit, seed, split counts, per-class report, and confusion matrix. See
[the ML quick start](./ml/README.md).

## Documentation

- [English documentation index](./docs/ENG/README.md)
- [MVP and product plan](./docs/ENG/planning/PLAN.md)
- [Local, Cloudflare, and Vercel setup](./docs/ENG/operations/SETUP.md)
- [Development progress log](./docs/planning/PROGRESS.md)
- [Current action items and annotation targets](./docs/ENG/planning/ACTION_ITEMS.md)
- [Model evaluation and logging standard](./docs/ENG/ml/MODEL_EVALUATION.md)
- [Academic goals and research approach](./docs/ENG/decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)
- [Implementation notes](./docs/ENG/decisions/IMPLEMENTATION_NOTES.md)
- [Synthetic dataset design](./docs/ENG/ml/SYNTHETIC_V1.md)
- [Open dataset research](./docs/ENG/ml/OPEN_DATASETS.md)
- [ML and NLP concepts](./docs/ENG/ml/ML_NLP_CONCEPTS.md)
- [Production annotation guide](./docs/ENG/annotation/ANNOTATION_GUIDE.md)
- [Annotation conventions v4](./docs/ENG/annotation/ANNOTATION_CONVENTIONS.md)

The progress log remains in `./docs/planning/PROGRESS.md` as the English source
log and is intentionally excluded from translation.

## MVP Commands

```text
Add two cartons of milk
We are low on eggs
We have no milk
I used one egg
Throw away the spinach
Put yogurt on the shopping list
Do we have milk
```

The initial deterministic parser validates the product workflow and collects corrected English utterances before model training begins.

## Current Limitations

The current language layer is a deterministic regular-expression parser, not a trained model. It works for the documented command patterns but does not yet generalize reliably to unrestricted English.

- Supported units are `bag`, `bottle`, `can`, `carton`, `dozen`, `jar`, `pack`, and `piece`, including plural forms.
- Quantities support digits, decimals, `a`, `an`, and English number words from one through ten.
- Confidence values are fixed per parser pattern; they are not calibrated model probabilities.
- Item normalization currently contains only a small alias list.
- Assistant drafts are annotation helpers only. They can miss spans, choose the
  wrong phrase family, or fall back to the parser when no OpenAI key is configured.
  Expiry spans are deterministically normalized from stored inference context;
  model-supplied calendar dates are never trusted directly.
- `ITEM_CONDITION` is available in reviewed annotation, but the runtime parser
  and bootstrap synthetic generator do not yet emit that entity label
  consistently on their own.
- Each user currently has one active household. Household switching and
  transferring ownership are not implemented.
- Join codes are revocable, hashed, and expiring, but public-scale join-attempt
  rate limiting remains a required security follow-up.
- Household category overrides personalize the current inventory immediately,
  but they are not automatically promoted into a global taxonomy.
- Multi-turn context resolution, learned user-goal modeling, recommendation
  ranking, and deal-provider integrations are roadmap items.
- Korean-English code-switching, personalized ASR, voice turn-taking, and
  Raspberry Pi deployment are planned experiments, not current product
  capabilities.
- Item-photo upload, vision recognition, barcode input, and catalog retrieval
  remain behind explicit privacy, storage, confirmation, and evaluation gates.
- The current TF-IDF baseline is single-intent. Multi-action annotation is stored
  now, but those records are explicitly excluded from this baseline and counted
  in its metrics metadata.
- Natural-language expiry parsing now covers explicit expiry phrases such as
  `expiring tomorrow`, `expires next Friday`, and `with expiry date on August twenty-eighth`,
  and every inference now stores an effective `reference_date` and validated
  `timezone` for deterministic replay. Assistant drafts and the expiry
  annotation UI consume that stored context; expiry normalization is performed
  server-side rather than from the annotation browser's current date.
- Interpretation requests can carry optional `conversation_id`, `turn_index`,
  `speaker_role`, and `activation_mode` metadata. The current UI records manual
  text from a user; context resolution across turns is not implemented yet.
- The parser may still incorrectly include unsupported date or unit phrases in
  `item_name`. Always review the interpretation before confirming.

The next language milestone is a hybrid pipeline: relevance classification,
intent classification, slot-span extraction, deterministic normalization,
schema validation, and explicit confirmation. See
[PLAN.md](./docs/ENG/planning/PLAN.md) and
[TEXT_DATASET_DESIGN_V1.md](./docs/ENG/ml/TEXT_DATASET_DESIGN_V1.md) for the
model and dataset roadmap.

Deterministic annotation queue seeds use the versioned
`annotation-queue-seed-v2` source. Expiry cases carry explicit temporal context,
and rerunning the seed command never mutates existing v2 rows.
