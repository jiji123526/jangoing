# jangoing Progress Log

Add new entries at the top of the log so the latest state is easy to find.

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
