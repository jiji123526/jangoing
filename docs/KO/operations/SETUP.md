# jangoing 설정

## 준비 사항

- Git
- Node.js 22 이상
- npm 10 이상
- Cloudflare 계정
- Vercel 계정

## 로컬 설정

Repository root에서:

```bash
npm install
```

API와 web app을 각각 다른 터미널에서 실행한다.

```bash
npm run dev:api
npm run dev:web
```

`http://localhost:3000`을 연다. 로컬 API 기본 주소는
`http://localhost:8787`이다.

Dashboard view에 로컬 demo content를 바로 넣고 싶다면 로컬 SQLite DB에 sample
data를 seed한다.

```bash
npm run seed:local-sample
```

이 명령은 production D1은 건드리지 않고 `home`, `inventory`, `shopping`에 필요한
deterministic local-only sample event를 넣는다. 다시 실행하면
`local-ui-sample-*` record만 교체한다.

API URL을 직접 지정하려면 `apps/web/.env.local.example`을 복사해
`apps/web/.env.local`을 만든다.

로컬 API는 자동으로 `apps/api/.local/jangoing.sqlite`를 만들고, 필요한 event,
correction, inference-log, annotation, inventory schema migration을 `0014`까지
적용한다. 이렇게 해야 로컬 개발이 Cloudflare 인증과 native runtime에서
분리된다. Production은 여전히 Cloudflare Worker와 D1을 사용한다.

## Google Authentication 및 Household Rollout

Consumer page에서는 authentication이 mandatory다. Email allowlist는 없으며 모든
Google account가 sign in할 수 있다. Signed-in user는 household를 join하거나
생성해야 app과 bottom navigation을 볼 수 있다.

### 1. Google OAuth Credential 생성

Google Cloud Console에서:

1. OAuth consent screen을 External로 설정한다.
2. `openid`, `email`, `profile` scope만 요청한다.
3. Web application 유형의 OAuth client를 생성한다.
4. 다음 local 값을 추가한다.

```text
Authorized JavaScript origin:
http://localhost:3000

Authorized redirect URI:
http://localhost:3000/api/auth/callback/google
```

5. `<WEB_ORIGIN>`을 실제 production Vercel/custom origin으로 교체해 추가한다.

```text
Authorized JavaScript origin:
<WEB_ORIGIN>

Authorized redirect URI:
<WEB_ORIGIN>/api/auth/callback/google
```

Consent screen이 Testing이면 등록한 Google test user만 sign in할 수 있다. 모든
Google account를 허용하려면 consent screen을 Production으로 publish한다. Basic
identity scope를 위해 Gmail, Drive 등 다른 Google data access를 요청하지 않는다.

### 2. 독립적인 Secret 세 개 생성

다음 command를 세 번 실행하고 각 output을 따로 보관한다.

```bash
openssl rand -base64 32
```

각 값을 다음 용도로 사용한다.

- `AUTH_SECRET`: Auth.js cookie/session encryption
- `APP_JWT_SECRET`: Vercel과 Worker만 공유
- `HOUSEHOLD_CODE_SECRET`: Worker-only join-code hashing

Google client secret을 이 값으로 재사용하지 않는다. Server-only variable에
`NEXT_PUBLIC_` prefix를 붙이지 않는다.

### 3. Local Web Authentication 설정

`.env.local.example`을 기준으로 `apps/web/.env.local`을 만들고 다음을 설정한다.

```text
NEXT_PUBLIC_API_BASE_URL=<DEPLOYED_WORKER_ORIGIN>
AUTH_SECRET=<AUTH_SECRET>
AUTH_GOOGLE_ID=<GOOGLE_OAUTH_CLIENT_ID>
AUTH_GOOGLE_SECRET=<GOOGLE_OAUTH_CLIENT_SECRET>
APP_JWT_SECRET=<APP_JWT_SECRET>
APP_JWT_ISSUER=jangoing-web
APP_JWT_AUDIENCE=jangoing-api
```

End-to-end local authentication test에는 deployed Worker를 사용한다.
Node/SQLite development API에는 Worker authentication과 household route가 없다.

### 4. Required Auth를 켜지 않고 Cloudflare 준비

`AUTH_REQUIRED=false`를 유지한 상태로 migration `0014`까지 적용하고 secret을
설정한 뒤 Worker를 배포한다.

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run db:migrate:remote

cd apps/api
npx wrangler secret put APP_JWT_SECRET
npx wrangler secret put HOUSEHOLD_CODE_SECRET
cd ../..

npm run deploy:api
```

Vercel과 동일한 `APP_JWT_SECRET`을 입력한다. `APP_JWT_ISSUER`와
`APP_JWT_AUDIENCE`는 `wrangler.toml`에 이미 정의된 non-secret Worker variable다.

### 5. Vercel 설정 및 배포

Vercel production environment variable에 다음 값을 설정한다.

```text
NEXT_PUBLIC_API_BASE_URL=<DEPLOYED_WORKER_ORIGIN>
AUTH_SECRET=<AUTH_SECRET>
AUTH_GOOGLE_ID=<GOOGLE_OAUTH_CLIENT_ID>
AUTH_GOOGLE_SECRET=<GOOGLE_OAUTH_CLIENT_SECRET>
APP_JWT_SECRET=<WORKER와_동일한_APP_JWT_SECRET>
APP_JWT_ISSUER=jangoing-web
APP_JWT_AUDIENCE=jangoing-api
```

Web을 redeploy하고 production app에서 기존 inventory를 소유할 Google account로
sign in한다. Household-choice screen에서 멈추고 household를 직접 생성하지 않는다.
Membership check가 backfill에 필요한 stable Google-linked user를 생성한다.

### 6. Bootstrap Backfill Audit 및 적용

먼저 `<GOOGLE_EMAIL>`을 실제 signed-in account로 교체해 dry-run한다.

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run household:backfill-bootstrap -- \
  --remote \
  --owner-email "<GOOGLE_EMAIL>" \
  --household-name "Jiwoo's Home"
```

Event count, `web` inference count, app-state count, owner Google subject,
unassigned 상태로 유지할 inference source를 검토한다. 정확하면 적용한다.

```bash
npm run household:backfill-bootstrap -- \
  --remote \
  --owner-email "<GOOGLE_EMAIL>" \
  --household-name "Jiwoo's Home" \
  --apply \
  --confirm "Jiwoo's Home"
```

Web app을 refresh하면 onboarding을 건너뛰고 `Jiwoo's Home`을 열어야 한다.

Refresh, household inventory, shopping list, fridge-setup state,
sign-out/sign-in cycle을 확인하기 전에는 `AUTH_REQUIRED=true`로 바꾸지 않는다.

## Production 전용 Annotation 모드

Vercel annotation page가 항상 실제로 수집 중인 같은 DB를 보게 하려면,
annotation 작업에서는 `npm run dev:api`나 local SQLite를 사용하지 않는다.
이 모드에서는:

- Vercel `/annotate`가 deployed Worker와 production D1을 읽는다.
- Queue seeding은 반드시 `--remote`를 사용한다.
- Reviewed dataset export도 반드시 `--remote`를 사용한다.
- Local API와 local SQLite는 격리된 개발이나 디버깅용으로만 쓴다.

Production 전용 명령 모음:

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

Quantity 기반 inventory status update는 Worker가 `events.low_threshold`를 쓰기
때문에 아래 순서가 필요하다.

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run db:migrate:remote
npm run deploy:api
git push origin main
```

Inventory category override는 migration `0011`에서 `events.category`를 추가한다.
Worker 배포 전에 migration을 적용하고, 그 다음 Web도 다시 배포해 request contract가
API와 맞도록 한다.

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run db:migrate:remote
npm run deploy:api
git push origin main
```

Queue seed data가 실제로 production D1에 들어갔는지 확인하려면
`inference_logs`를 직접 조회한다. Queue sample은 별도의 queue table에 저장되지
않는다.

```bash
cd /home/jjiwoo/.workspace/jangoing/apps/api

# How many deterministic seed rows exist?
npx wrangler d1 execute jangoing-db --remote --command \
"SELECT COUNT(*) AS seeded_rows
 FROM inference_logs
 WHERE source = 'annotation-queue-seed-v2';"

# Show recent seed rows
npx wrangler d1 execute jangoing-db --remote --command \
"SELECT id, raw_utterance, source, outcome, created_at
 FROM inference_logs
 WHERE source = 'annotation-queue-seed-v2'
 ORDER BY created_at DESC
 LIMIT 20;"
```

D1 UI 왼쪽 패널에 `annotations`, `corrections`, `events`, `inference_logs` 같은
table과 index만 보이는 것은 정상이다. Queue는 `inference_logs`에 대한 query이지,
독립된 저장 table이 아니다.

`/annotate`에 deterministic reviewed sample을 queue별로 미리 넣고 싶다면:

```bash
npm run annotation:seed-queues
```

Pregenerated JSONL dataset을 dedicated `generated_review` queue에 넣으려면:

```bash
npm run annotation:import-generated -- \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

현재 기본 seed target:

- `correction` sample 36개
- `expiry` sample 48개
- `low_confidence` sample 36개
- `confirmed_unannotated` sample 42개
- `evaluation_holdout` sample 24개

이 script는 deterministic ID namespace 안에서는 idempotent하며, seed 후 실제 로컬
queue count를 출력한다. Migration이 이미 적용된 production D1을 seed하려면:

```bash
npm run annotation:seed-queues -- --remote
```

Pregenerated review import도 같은 방식으로 `--remote`를 붙인다.

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

## ML 설정

Python 3.11 이상을 사용한다. macOS system Python은 더 오래된 버전일 수 있으니,
environment를 만들기 전에 `python3 --version`으로 먼저 확인한다.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
```

먼저 reproducible synthetic bootstrap을 학습한다.

```bash
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
```

`synthetic-v1`과 queue seed data는 최종 distribution이 아니라 bootstrap source로
취급한다. Pipeline check, 초기 model smoke test, annotation bootstrapping에는
유용하지만, 시간이 갈수록 reviewed real utterance가 training과 evaluation의
주요 source가 되어야 한다.

충분한 single-action annotation이 쌓이면 reviewed local interaction을 export해
별도의 human-data run을 학습한다.

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
pytest ml/tests
```
