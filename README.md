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

The first milestone is a text-based MVP:

1. Enter an English command such as `We are low on milk`.
2. Review the structured action produced by the command parser.
3. Confirm the action before it changes inventory.
4. See the updated inventory, shopping list, and event history.

An optional expiry date can be attached to added items. The correction flow is
also the first labeled-data source. Trained contextual models, recommendation
ranking, Raspberry Pi audio, and speech-to-text follow once the evaluation and
logging foundation is reliable.

## Stack

- `apps/web`: Next.js mobile web app, deployed on Vercel
- `apps/api`: Cloudflare Worker API with D1 storage
- `packages/contracts`: shared Zod schemas and TypeScript types
- `ml`: future English intent-classification and slot-extraction work
- `pi`: future Raspberry Pi voice client
- `ml`: dataset validation, grouped splitting, and the first intent baseline

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

## First ML Baseline

After collecting reviewed commands, export and train locally:

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
npm run dataset:export -- --output ml/data/reviewed.jsonl
python ml/train_baseline.py ml/data/reviewed.jsonl
```

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
- [머신러닝·자연어 처리·언어학 개념 안내서](./ML_NLP_CONCEPTS_KO.md)

## MVP Commands

```text
Add two cartons of milk
We are low on eggs
I used one egg
Throw away the spinach
Put yogurt on the shopping list
Do we have milk
```

The initial deterministic parser validates the product workflow and collects corrected English utterances before model training begins.

## Current Limitations

The current language layer is a deterministic regular-expression parser, not a trained model. It works for the documented command patterns but does not yet generalize reliably to unrestricted English.

- Natural-language expiry dates such as `next Friday` or `August twenty-eighth` are not extracted. Use the date picker or an inline ISO date such as `expiring 2026-08-28`.
- Supported units are `bag`, `bottle`, `can`, `carton`, `dozen`, `jar`, `pack`, and `piece`, including plural forms.
- Quantities support digits, decimals, `a`, `an`, and English number words from one through ten.
- Confidence values are fixed per parser pattern; they are not calibrated model probabilities.
- Item normalization currently contains only a small alias list.
- Shopping-list removal, authentication, and multiple households are not implemented.
- Multi-turn context, user goals, recommendation ranking, and deal-provider
  integrations are roadmap items, not current capabilities.
- The parser may incorrectly include unsupported date or unit phrases in `item_name`. Always review the interpretation before confirming.

The next language milestone is a hybrid pipeline: intent classification, slot-span extraction, deterministic date/unit normalization, schema validation, and explicit confirmation. See [PLAN.md](./PLAN.md) for the model and dataset roadmap.
