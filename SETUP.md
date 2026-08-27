# jangoing Setup

## Prerequisites

- Git
- Node.js 22 or newer
- npm 10 or newer
- A Cloudflare account
- A Vercel account

## Local Setup

From the repository root:

```bash
npm install
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The local API defaults to `http://localhost:8787`.

To override the API URL, create `apps/web/.env.local` from `apps/web/.env.local.example`.

The local API automatically creates `apps/api/.local/jangoing.sqlite` and applies
the event, correction, inference-log, and annotation schemas through migration
0006. This keeps local development
independent from Cloudflare authentication and its native runtime. Production
still uses the Cloudflare Worker and D1.

## Production-Only Annotation Mode

If you want the Vercel annotation page to always reflect the same DB you are
collecting from, do not use `npm run dev:api` or local SQLite for annotation
operations. In this mode:

- Vercel `/annotate` reads the deployed Worker and production D1.
- Queue seeding must use `--remote`.
- Reviewed dataset export must use `--remote`.
- Local API and local SQLite are only for isolated development or debugging.

Production-only command cheat sheet:

```bash
cd /home/jjiwoo/.workspace/jangoing

# Seed the production annotation queues
npm run annotation:seed-queues -- --remote

# Import a pregenerated dataset as generated-review annotation candidates
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1

# Seed the production annotation queues with a custom mix
npm run annotation:seed-queues -- --remote \
  --correction 50 \
  --expiry 120 \
  --low-confidence 70 \
  --confirmed 40 \
  --evaluation 20

# Annotate on the production page
# https://jangoing-web.vercel.app/annotate

# Export reviewed production data to local JSONL files
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl

# Optional: enable assistant drafts on the production Worker
cd apps/api
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
cd ../..

# Apply new D1 migrations before deploy when schema changes
npm run db:migrate:remote

# Deploy API changes
npm run deploy:api

# Deploy web changes
git push origin main
```

To confirm that queue seed data is actually present in production D1, query
`inference_logs` directly. Queue samples are not stored in separate queue tables.

```bash
cd /home/jjiwoo/.workspace/jangoing/apps/api

# How many deterministic seed rows exist?
npx wrangler d1 execute jangoing-db --remote --command \
"SELECT COUNT(*) AS seeded_rows
 FROM inference_logs
 WHERE source = 'annotation-queue-seed-v1';"

# Show recent seed rows
npx wrangler d1 execute jangoing-db --remote --command \
"SELECT id, raw_utterance, source, outcome, created_at
 FROM inference_logs
 WHERE source = 'annotation-queue-seed-v1'
 ORDER BY created_at DESC
 LIMIT 20;"
```

If the D1 UI sidebar only shows tables and indexes such as `annotations`,
`corrections`, `events`, and `inference_logs`, that is expected. The queue is a
query over `inference_logs`, not its own stored table.

To prefill `/annotate` with deterministic reviewed samples for each queue, run:

```bash
npm run annotation:seed-queues
```

To import a pregenerated JSONL dataset into the dedicated `generated_review`
queue, run:

```bash
npm run annotation:import-generated -- \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

The default seed currently targets:

- 36 `correction` samples
- 48 `expiry` samples
- 36 `low_confidence` samples
- 42 `confirmed_unannotated` samples
- 24 `evaluation_holdout` samples

The script is idempotent for its deterministic ID namespace and prints the
actual local queue counts after seeding. To seed the production D1 instead,
after migrations are already applied, run:

```bash
npm run annotation:seed-queues -- --remote
```

For pregenerated review imports, use the same command with `--remote`:

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

## ML Setup

Use Python 3.11 or newer. The macOS system Python may be older, so verify with
`python3 --version` before creating the environment.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
```

Train the reproducible synthetic bootstrap first:

```bash
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
```

Treat `synthetic-v1` and queue seed data as bootstrap sources, not the final
distribution to optimize for. They are useful for pipeline checks, early model
smoke tests, and annotation bootstrapping, but reviewed real utterances should
become the dominant training and evaluation source over time.

Export reviewed local interactions and train a separate human-data run after
enough single-action annotations exist:

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
pytest ml/tests
```

The exporter excludes pending and cancelled interactions from supervised training.
`--task intent` is the default. Use `--task slots` or `--task joint` to require
annotation-backed rows for span-supervised training. Raw conversational data and
generated model artifacts are ignored by Git.

The default export reads `apps/api/.local/jangoing.sqlite`, which is created after
running `npm run dev:api`. To export reviewed production records from D1, use:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

After applying migrations 0004, 0005, and 0006, the production annotation
workspace is available at `/annotate`. Its action groups and reviewed entity
spans are included in subsequent exports. Multi-action records are preserved in
JSONL but excluded from the current single-intent baseline. When `OPENAI_API_KEY`
is configured on the Worker, `/annotate` can also request assistant-generated
annotation drafts; otherwise it falls back to a parser-based draft.

To test with Wrangler's local D1 runtime on a compatible machine:

```bash
npm run db:migrate:local
npm run dev:worker --workspace @jangoing/api
```

## Cloudflare Setup

Account authentication must be completed by the account owner.

### 1. Authenticate Wrangler

```bash
npx wrangler login
```

### 2. Create D1

```bash
npm run db:create
```

Copy the returned database ID into `apps/api/wrangler.toml`, replacing the placeholder `database_id`.

### 3. Apply Production Migrations

```bash
npm run db:migrate:remote
```

### 4. Deploy the Worker

Run this from the repository root:

```bash
npm run deploy:api
```

Alternatively, target the API workspace directly:

```bash
cd apps/api
npx wrangler deploy
```

Do not run `npx wrangler deploy` from the repository root. Wrangler detects the
npm workspace but cannot choose between `apps/web` and `apps/api`, which produces
the "root of a workspace" application-detection error.

Record the generated URL, similar to:

```text
https://jangoing-api.<account-subdomain>.workers.dev
```

The currently configured Worker is:

```text
https://jangoing-api.letmetellu.workers.dev
```

### 5. Configure Allowed Origins

After Vercel assigns the production URL:

```bash
cd apps/api
npx wrangler secret put ALLOWED_ORIGINS
```

Enter comma-separated origins without trailing slashes:

```text
https://jangoing.vercel.app
```

Redeploy the Worker after updating configuration.

### 6. Optional: Enable OpenAI-backed Annotation Drafts

If you want `/annotate` to request AI-generated draft labels from the Worker:

```bash
cd apps/api
npx wrangler secret put OPENAI_API_KEY
```

Optional model override:

```bash
cd apps/api
npx wrangler secret put OPENAI_MODEL
```

- Default model is `gpt-4.1-mini` when `OPENAI_MODEL` is unset.
- If `OPENAI_API_KEY` is missing, the proposal endpoint returns a parser fallback
  draft instead of failing.
- After changing secrets, redeploy the Worker.

## Vercel Setup

1. Create a Vercel project and import the `jangoing` repository.
2. Set the root directory to `apps/web`.
3. Keep the detected Next.js build settings.
4. Add the environment variable below for Production, Preview, and Development.

```text
NEXT_PUBLIC_API_BASE_URL=https://jangoing-api.<account-subdomain>.workers.dev
```

5. Deploy or redeploy the project.
6. Add the final Vercel origin to the Worker's `ALLOWED_ORIGINS`.

Vercel should detect the root npm lockfile and install the local `@jangoing/contracts` workspace package.

For preview deployments, allow each preview origin explicitly or use a controlled custom preview domain. Do not enable wildcard CORS in production.

## External Setup Checklist

- [x] Cloudflare account available
- [x] Wrangler authenticated
- [x] Production D1 created
- [x] D1 ID added to `wrangler.toml`
- [ ] Production migrations through 0006 applied
- [x] Worker deployed and health endpoint verified
- [x] Repository imported into Vercel and connected to `main`
- [x] `NEXT_PUBLIC_API_BASE_URL` configured
- [x] Vercel origin added to `ALLOWED_ORIGINS`
- [ ] Optional: `OPENAI_API_KEY` configured on Worker for assistant drafts
- [ ] Recheck the complete production annotation save flow after each schema change
