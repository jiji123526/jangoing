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
the event, correction, and inference-log schemas. This keeps local development
independent from Cloudflare authentication and its native runtime. Production
still uses the Cloudflare Worker and D1.

## ML Setup

Use Python 3.11 or newer. The macOS system Python may be older, so verify with
`python3 --version` before creating the environment.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
```

Export reviewed local interactions and train the CPU baseline:

```bash
npm run dataset:export -- --output ml/data/reviewed.jsonl
python ml/train_baseline.py ml/data/reviewed.jsonl
pytest ml/tests
```

The exporter excludes pending and cancelled interactions from supervised training.
Raw conversational data and generated model artifacts are ignored by Git.

The default export reads `apps/api/.local/jangoing.sqlite`, which is created after
running `npm run dev:api`. To export reviewed production records from D1, use:

```bash
npm run dataset:export -- --remote --output ml/data/reviewed.jsonl
```

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

- [ ] Cloudflare account available
- [ ] Wrangler authenticated
- [ ] Production D1 created
- [ ] D1 ID added to `wrangler.toml`
- [ ] Production migration applied
- [ ] Worker deployed
- [ ] Repository imported into Vercel
- [ ] `NEXT_PUBLIC_API_BASE_URL` configured
- [ ] Vercel origin added to `ALLOWED_ORIGINS`
- [ ] Production text-command flow tested
