# jangoing

A model-first conversational kitchen intelligence project. It measures how well
language systems can recover requests and relevant context from everyday
conversation, then turns that understanding into safe inventory actions and
personalized recommendations.

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

The text MVP and the production annotation workspace are running. Current work
is the first human-reviewed English dataset and its evaluation split:

1. Bootstrap the single-intent baseline with the reproducible 800-record
   `synthetic-v1` dataset.
2. Use `/annotate` to collect natural English training and evaluation candidates.
3. Label one-to-eight action groups per utterance, with action-specific intent,
   phrase family, entity spans, and normalized values.
4. Use assistant drafts in `/annotate` only as a speed aid, not as automatic truth.
5. Freeze an independent human evaluation set before comparing larger models.

The kitchen dashboard remains the confirmed product-action flow and a separate
correction source. Trained contextual models, recommendation ranking, Raspberry
Pi audio, and speech-to-text remain later milestones.

## Stack

- `apps/web`: Next.js mobile web app, deployed on Vercel
- `apps/api`: Cloudflare Worker API with D1 storage
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
action groups for actionable utterances. Its header
tracks progress toward 100–200 human training candidates and 100+ independent
evaluation candidates. These are collection targets, not model-quality claims.
It can also request an assistant draft for the current utterance and record
whether the final saved annotation matched that draft or was edited.
Generated relevance candidates can be routed into dedicated preference/context,
domain-non-actionable, and unrelated-negative queues. Their candidate label is
only a UI preselection; the reviewed annotation remains the ground truth.

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

- [MVP and product plan](./PLAN.md)
- [Local, Cloudflare, and Vercel setup](./SETUP.md)
- [Development progress log](./PROGRESS.md)
- [Model evaluation and logging standard](./MODEL_EVALUATION.md)
- [구현 내용과 기술적 의사결정 설명서](./IMPLEMENTATION_NOTES_KO.md)
- [영어 synthetic-v1 생성 및 의사결정 기록](./SYNTHETIC_V1_KO.md)
- [공개 데이터셋 조사 및 도입 계획](./OPEN_DATASETS_KO.md)
- [머신러닝·자연어 처리·언어학 개념 안내서](./ML_NLP_CONCEPTS_KO.md)
- [Production annotation 화면 사용 및 의사결정 기록](./ANNOTATION_GUIDE_KO.md)
- [Annotation 정답 결정 규칙 v2](./ANNOTATION_CONVENTIONS_KO.md)

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
- `ITEM_CONDITION` is available in reviewed annotation, but the runtime parser
  and bootstrap synthetic generator do not yet emit that entity label
  consistently on their own.
- Shopping-list removal, authentication, and multiple households are not implemented.
- Multi-turn context, user goals, recommendation ranking, and deal-provider
  integrations are roadmap items, not current capabilities.
- The current TF-IDF baseline is single-intent. Multi-action annotation is stored
  now, but those records are explicitly excluded from this baseline and counted
  in its metrics metadata.
- Natural-language expiry parsing now covers explicit expiry phrases such as
  `expiring tomorrow`, `expires next Friday`, and `with expiry date on August twenty-eighth`,
  and the browser's `reference_date` and `timezone` are now logged for replay,
  but broader date-context handling is still incomplete.
- Interpretation requests can carry optional `conversation_id`, `turn_index`,
  `speaker_role`, and `activation_mode` metadata. The current UI records manual
  text from a user; context resolution across turns is not implemented yet.
- The parser may still incorrectly include unsupported date or unit phrases in
  `item_name`. Always review the interpretation before confirming.

The next language milestone is a hybrid pipeline: intent classification, slot-span extraction, deterministic date/unit normalization, schema validation, and explicit confirmation. See [PLAN.md](./PLAN.md) for the model and dataset roadmap.
