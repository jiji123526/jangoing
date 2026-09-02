# 임시 Google 인증 및 Household 데이터 구현 계획

상태: 임시 구현 계획  
작성일: 2026-09-02

## 목적

이 문서는 Jangoing에 Google login과 개인화된 inventory 및 shopping-list
데이터를 추가하는 구현 순서를 정의한다.

이 문서는 임시 문서다. 배포가 끝나면 장기적으로 유지할 architectural decision은
decision record로 옮기고, 완료된 작업은 progress log로 옮긴 뒤 이 파일을
삭제하거나 남은 follow-up만 유지한다.

## 현재 상태

현재 제품에는 authentication 또는 authorization layer가 없다.

- Next.js web app이 Cloudflare Worker를 직접 호출한다.
- Worker는 identity 없이 consumer request를 받는다.
- D1 `events` table은 전역으로 공유된다.
- Inventory와 shopping list는 모든 event를 사용해 projection한다.
- Fridge-setup 완료 상태를 포함한 `app_state`가 전역 key를 사용한다.
- Inference log에는 해당 interaction을 만든 user 또는 household 정보가 없다.
- Annotation infrastructure는 현재 consumer identity와 분리되어 있다.

Google sign-in button만 추가해서는 personalized data가 만들어지지 않는다.
모든 consumer read와 write를 authenticated household 기준으로 제한해야 한다.

## 권장 MVP Architecture

```text
Google OAuth
-> Next.js app의 Auth.js session
-> same-origin endpoint가 short-lived Jangoing app JWT 발급
-> browser가 Authorization: Bearer <token>으로 Worker 호출
-> Worker가 token을 검증하고 D1에서 user 확인
-> user가 code로 household에 join하거나 새 household 생성
-> Worker가 active household membership 확인
-> 모든 consumer query를 household_id로 제한
```

Google access token을 일반 Worker API credential로 사용하지 않는다. Jangoing이
application에 필요한 identity claim만 포함한 자체 short-lived token을 발급한다.

첫 release 범위:

- Google login은 user identity만 생성하거나 갱신한다.
- Membership이 없는 user에게 household code가 있는지 묻는다.
- Valid code는 기존 household에 즉시 member access를 부여한다.
- Code가 없는 user는 새 household를 만들고 owner가 된다.
- 각 user는 active household 하나만 가진다.
- Household switching은 아직 지원하지 않는다.
- Inventory와 shopping data는 household 소유다.
- Event에는 변경을 만든 user를 provenance로 남긴다.
- Annotation은 별도 research/admin surface로 유지한다.

Google login 시 household를 자동 생성하지 않는다. 그래야 이미 shared inventory가
있는 다른 member가 중복 household list를 만들지 않는다. 기존 membership이 있는
user는 onboarding 없이 household를 바로 연다.

## Data Model

### Users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`google_subject`는 Google의 stable `sub` claim이다. Email은 변경될 수 있으므로
identity key로 사용하지 않는다.

### Households

```sql
CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Memberships

```sql
CREATE TABLE household_memberships (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id)
);
```

`user_id`와 `household_id` lookup용 index를 추가한다.

### Household Join Code

Household ID를 노출하지 않고 revoke 가능한 join credential을 사용한다.

```sql
CREATE TABLE household_join_codes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
```

권장 code policy:

- Cryptographic randomness 최소 50 bit 사용
- `ABCD-EFGH-JK` 같은 읽기 쉬운 uppercase code 표시
- 검증 전 case와 separator normalize
- Worker secret을 사용하는 keyed hash만 저장
- Plaintext는 생성 시점에만 표시
- 7일 후 만료
- Owner가 active code를 rotate 또는 revoke 가능
- Authenticated user와 IP 기준으로 join attempt rate limit
- Household detail을 노출하지 않는 동일한 invalid-code response 사용

Code는 즉시 `member` access를 부여하므로 bearer credential로 취급한다. Permanent
household identifier나 authenticated user session의 대체 수단으로 사용하지 않는다.

### Events

다음 field를 추가한다.

```text
household_id
created_by_user_id
```

`household_id`는 ownership을 결정한다. `created_by_user_id`는 provenance이며,
system-generated, imported, migrated record에서는 nullable일 수 있다.

모든 event query는 authenticated `household_id`를 포함해야 한다. Projection
function은 이미 household 기준으로 filter된 event list를 받으므로 household를
직접 알 필요가 없다.

### Household App State

현재 global `app_state.key` primary key로는 여러 household가 같은 key를 가질 수
없다. 다음 household-scoped table로 교체한다.

```sql
CREATE TABLE household_app_state (
  household_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, key)
);
```

Fridge-setup completion은 이 table을 사용해야 한다.

### Inference Provenance

`inference_logs`에 nullable field를 추가한다.

```text
household_id
user_id
```

Authenticated consumer interaction은 이 값을 기록한다. Generated review import와
legacy research record는 null이어도 된다. Annotation record는 household identity를
중복 저장하지 않고 inference record를 계속 참조한다.

## Migration 순서

Schema rollout과 data migration을 독립적으로 확인할 수 있도록 migration을
분리한다.

1. `users`, `households`, `household_memberships`,
   `household_join_codes` 생성
2. `events`에 nullable household/user column 추가
3. `inference_logs`에 household/user column 추가
4. `household_app_state` 생성
5. Household와 join-code index 추가
6. 선택한 policy에 따라 legacy consumer record를 backfill하거나 제거
7. Application code에서 신규 consumer write에 household ownership 강제

이후 `household_id`를 물리적으로 `NOT NULL`로 만들려면 D1/SQLite table rebuild가
필요할 수 있다. 먼저 application에서 invariant를 강제하고 production 확인 후
schema를 강화한다.

### Schema 단계 상태

2026-09-02 구현 완료:

- `0012_add_household_ownership.sql`이 user, household, membership, join code,
  household-scoped app state를 생성한다.
- 기존 event와 inference ownership column은 additive 및 nullable이므로 bootstrap
  migration 전까지 legacy row가 계속 valid하다.
- Household lookup, join-code expiry, event ownership, inference provenance
  index가 포함되어 있다.
- Node 기반 local API bootstrap은 `users` table이 없는 기존 local database에
  migration을 적용한다.
- Schema test가 legacy-row compatibility, role 및 foreign-key constraint,
  household app-state isolation을 검증한다.

Migration은 repository의 Node/SQLite local database에 적용했다. Remote D1에는
아직 적용하지 않았다. 7단계는 application code에 구현했으며 6단계는 legacy-data
owner를 선택한 뒤 진행한다.

## Legacy Data 결정

Data migration 전에 다음 중 하나를 선택한다.

- **Consumer state reset:** 기존 consumer event를 삭제하고 각 account가 fridge
  setup부터 시작
- **Bootstrap account에 할당:** user/household 하나를 만들고 기존 consumer event를
  모두 할당
- **Demo data로 보존:** 기존 event를 일반 user에게 반환하지 않는 명시적 demo
  household로 이동

현재 production instance에는 명시적 bootstrap household를 만들고, 기존 consumer
state를 여기에 할당하며, owner Google subject를 미리 설정하는 방식을 권장한다.
다른 member는 생성된 code로 같은 household에 join한다. Annotation과 inference
research data는 별도로 보존한다.

명시적으로 설정한 email 또는 Google subject 없이, 우연히 처음 login한 user에게
global data를 자동 할당하면 안 된다.

### 선택한 Legacy Policy 및 Tooling

2026-09-02 선택:

- Bootstrap household를 `Jiwoo's Home`으로 생성한다.
- `household_id`가 null인 모든 consumer event를 해당 household에 할당한다.
- Original actor를 증명할 수 없으므로 legacy event의 `created_by_user_id`는 null로
  유지한다.
- `household_id`가 null이고 source가 정확히 `web`인 inference log만 household와
  owner에게 할당한다.
- Generated, annotation-review 및 모든 non-`web` inference source는 할당하지
  않는다.
- 기존 global app-state value를 삭제하지 않고 rollback copy로 유지하면서
  household app-state table에 복사한다.

`apps/api/scripts/backfill-bootstrap-household.ts`가 이 policy를 구현한다. 이
command는 remote-only이며 기본 동작은 dry-run이다. Apply 전 모든 household
table, supplied email과 일치하는 signed-in user 정확히 한 명, 해당 user의 기존
membership 없음, `Jiwoo's Home`이라는 기존 household 없음 조건을 확인한다.
실제 적용에는 `--apply`와 정확한 `--confirm "Jiwoo's Home"`이 모두 필요하다.
D1 file transaction 이후 할당한 row count도 검증한다.

Tool은 아직 실행하지 않았다. 먼저 owner가 Google login을 완료해 Worker가 stable
Google `sub`와 연결된 user를 생성해야 한다.

## Web Authentication

`apps/web`에 Google provider를 사용하는 Auth.js를 추가한다.

예상 파일:

```text
apps/web/auth.ts
apps/web/app/api/auth/[...nextauth]/route.ts
apps/web/app/api/app-token/route.ts
```

Auth.js callback은 다음을 수행한다.

- Google `sub` claim 유지
- Server session에 필요한 profile field만 노출
- 향후 Google API integration에서 실제로 필요해지기 전에는 Google access token
  또는 refresh token을 저장하지 않음
- Private MVP에서는 optional allowlist 밖의 account 거부

App-token route는 다음을 수행한다.

- Valid server-side Auth.js session 요구
- 초기 10분 lifetime의 token 발급
- `sub`, `iss`, `aud`, `iat`, `exp` 포함
- User upsert에 필요하면 display profile claim 포함
- Token을 local storage에 저장하지 않음

Browser는 app token을 memory에 cache하고 expiration 전에 same-origin endpoint를
통해 갱신할 수 있다.

### Web Authentication 단계 상태

2026-09-02 구현 완료:

- Auth.js v5가 encrypted JWT session과 Google OAuth를 사용한다.
- Google `sub`는 server가 읽는 Auth.js token에 유지하며 public browser session
  object에는 추가하지 않는다.
- `/api/app-token`은 Auth.js session을 요구하고 Worker issuer와 audience를 가진
  10분 lifetime HS256 Jangoing token을 발급한다.
- API client는 app token을 module memory에만 cache하고 expiry 전에 refresh하며
  Worker `401`을 한 번 retry한다.
- `AUTH_REQUIRED=false` 동안 signed-out request는 temporary anonymous
  compatibility를 유지한다.
- Token signing test가 HS256 signature, claim shape, 10분 expiry를 검증한다.

Google OAuth credential, production secret, login UI, route gating, optional
private-MVP allowlist는 아직 configure 또는 구현하지 않았다.

## Worker Authentication

Worker에 작은 authentication module을 추가한다.

책임:

- Bearer token parse
- Signature, algorithm, issuer, audience, expiration 검증
- Credential이 없거나 invalid하면 `401`
- 첫 authenticated access에서 Google-linked user upsert
- Membership이 없으면 explicit `household_required` state 반환
- Verified code로 기존 household에 transactionally join
- Household, owner membership, initial join code를 transactionally 생성
- Consumer route에서 active membership 하나를 resolve
- Household route handler에 `{ userId, householdId, role }` 제공

Allowed CORS header에 `Authorization`을 추가한다.

Request body 또는 query parameter의 `user_id`, `household_id`, email을 authority로
받지 않는다. 이 값은 verified token과 D1 membership lookup에서만 가져온다.

### Worker Authentication 단계 상태

2026-09-02 구현 완료:

- `apps/api/src/auth.ts`가 Web Crypto로 Jangoing HS256 app JWT를 검증한다.
- 검증에는 configured algorithm, signature, issuer, audience, Google `sub`,
  email, issued-at time, expiry가 필요하다.
- Token lifetime은 최대 15분이며 future-issued 또는 expired token은 거부한다.
- Email이 아니라 stable Google `sub`를 사용해 user를 upsert한다.
- Profile 변경 시 기존 user를 update하며 claim이 없다는 이유로 저장된 name 또는
  avatar를 삭제하지 않는다.
- Single-household MVP에서 여러 membership이 발견되면 resolution을 거부한다.
- Consumer route는 auth boundary를 통과하고 health와 annotation route는 현재
  policy를 유지한다.
- Rollout auth가 optional이어도 전달된 malformed credential은 거부한다.
- CORS preflight response에 `Authorization`을 포함한다.
- `wrangler.toml`은 signing secret을 저장하지 않고 `AUTH_REQUIRED=false`,
  issuer `jangoing-web`, audience `jangoing-api`를 정의한다.

`AUTH_REQUIRED=true`일 때 credential이 없으면 `authentication_required`, invalid
credential이면 `invalid_token`, authenticated user에게 membership이 없으면
`household_required`를 반환한다.

Resolved identity와 household가 이제 consumer event, inference, fridge-state
access를 scope한다. Remote schema migration, legacy-data backfill, Worker secret,
web token issuer가 준비될 때까지 `AUTH_REQUIRED`는 `false`로 유지한다. App JWT
signing secret도 Worker production에 아직 설정하지 않았다.

## Route Policy

Household가 없는 authenticated user는 다음 route만 사용할 수 있다.

```text
GET  /households/current
POST /households/join
POST /households/create
```

Authenticated household member는 다음 route를 사용할 수 있다.

```text
GET /households/members
```

Household owner는 다음 route도 사용할 수 있다.

```text
POST /households/join-code
POST /households/join-code/revoke
DELETE /households/members/:userId
```

`POST /households/join`은 code를 받아 authenticated user를 member로 추가한다.
`POST /households/create`는 named household, owner membership, initial join code를
만든다. Single-household MVP에서는 active membership이 이미 있는 user의 join과
create를 모두 거부한다.

다음 consumer route에는 authentication을 요구한다.

```text
POST /commands/interpret
POST /inferences/outcome
GET,POST /events
GET /inventory
POST /inventory/*
GET /shopping-list
POST /shopping-list/*
GET,POST /fridge-setup*
```

모든 handler는 모든 read/write에서 authenticated household를 사용해야 한다.

Annotation route는 임시로 이 policy 밖에 유지하지만, 이를 최종 security model로
보면 안 된다. 다음 작업에는 이후 별도 admin authorization 결정이 필요하다.

```text
/annotations/*
dataset export
queue seeding
generated-review import
```

### Household API 단계 상태

2026-09-02 구현 완료:

- `GET /households/current`는 Google `sub`를 노출하지 않고 application profile과
  current household를 반환한다.
- `POST /households/create`는 household, owner membership, 최초 7일 유효 join
  code를 atomically 생성한다.
- `POST /households/join`은 전달된 code가 active 및 unexpired 상태일 때만
  membership을 atomically 추가한다.
- `POST /households/join-code`는 owner가 기존 active code를 revoke하고 replacement
  code를 발급하게 한다.
- `POST /households/join-code/revoke`는 owner가 replacement 없이 active code를
  무효화하게 한다.
- `GET /households/members`는 caller household에 속한 profile만 반환하고 owner를
  먼저 정렬한다.
- `DELETE /households/members/:userId`는 owner만 member를 제거할 수 있게 하며,
  owner 제거 시도와 다른 household target을 거부한다.
- Join code는 50 bit cryptographic randomness와 읽기 쉬운 `ABCD-EFGH-JK`
  format을 사용하며 HMAC-SHA256 hash만 저장한다.
- Invalid, expired, revoked code는 모두 동일한 `invalid_household_code`
  response를 반환한다.
- `0013_enforce_single_household_membership.sql` migration은 concurrent
  request가 한 user를 여러 household에 할당하지 못하게 한다.
- Shared contract가 household name, join-code input, household role, profile
  response, household summary를 검증한다.

Consumer auth가 optional rollout mode여도 모든 household route에는 valid app
JWT가 필요하다. `HOUSEHOLD_CODE_SECRET`은 remote에 아직 설정하지 않았다. Public
deployment 전 per-user 및 per-IP join-attempt rate limit을 추가해야 한다.

### Household Data-Scoping 단계 상태

2026-09-02 구현 완료:

- Event history, inventory, shopping-list projection은 authenticated membership의
  `household_id`와 일치하는 event만 읽는다.
- Inventory, shopping, confirmed-command, fridge-setup event write는
  `household_id`와 `created_by_user_id`를 모두 저장한다.
- Command interpretation은 inference log에 household와 user provenance를
  저장한다.
- Inference outcome과 confirmed event는 같은 household의 pending inference만
  resolve할 수 있다.
- Authenticated household의 fridge-setup completion은 `household_app_state`를
  사용한다.
- Rollout auth가 optional이어도 authenticated user에게 membership이 없으면
  `household_required`를 반환한다.
- Temporary anonymous rollout traffic은 `household_id IS NULL`인 legacy
  record에만 접근하며 authenticated household record는 볼 수 없다.
- Public event query는 explicit contract field만 선택하므로 internal ownership
  column이 API response에 노출되지 않는다.

SQLite 기반 request test가 inventory, mutation ownership, inference outcome,
fridge-setup state에서 household A, household B, anonymous legacy data 간 isolation을
검증한다.

Application-level isolation은 완료했지만 production activation은 아직 아니다.
`AUTH_REQUIRED=true` 전에 remote migration, explicit legacy-data ownership, secret
configuration, web app-token issuer를 완료해야 한다.

## Frontend 변경

Web app에 다음을 적용한다.

- Auth.js session이 없으면 Google sign-in screen 표시
- Authentication 직후 household membership 확인
- Membership이 없으면 `Do you have your household code?` 표시
- `Yes`를 선택하면 household-code field와 immediate join action 표시
- `No`를 선택하면 household creation 표시
- Household 생성 후 owner에게 initial join code 표시
- Membership이 resolve된 뒤에만 consumer data load
- `apps/web/lib/api.ts`의 Worker request에 app JWT 추가
- `401`이면 app token을 한 번 refresh하고, 실패하면 sign-in으로 이동
- 기존 profile placeholder를 account menu로 변경
- Sign out 지원
- Sign out 시 client state의 household data 제거
- Persistent browser storage에 token 저장 금지

Invalid, expired, revoked code는 user를 onboarding에 유지하고 동일한 generic error를
표시한다. Join 성공 전에는 household name이나 member list를 노출하지 않는다.

Signed-out screen은 marketing landing page가 아니라 실제 authentication gate로
구현한다.

## Onboarding UI 계획

Apple Music iOS onboarding sample은 새로운 visual identity가 아니라 interaction
reference로 사용한다. 여기서 적용할 핵심 pattern은 fixed navigation, screen당 하나의
명확한 decision, 분명한 selected state, 하단의 안정적인 primary action을 갖는
layered mobile sheet다.

기존 `FridgeSetupDialog`의 구조를 재사용한다.

- Native dialog와 mobile-width sheet 동작
- Back, title 또는 progress, conditional close를 제공하는 fixed header
- Scroll 가능한 content 영역
- Primary action을 위한 fixed footer
- 기존 Jangoing color, typography, spacing, compact corner radius

두 번째 onboarding dialog framework를 만들지 않는다. Authentication과 household
setup은 같은 shell을 사용하고 fridge-setup content만 다음 state machine으로
교체한다.

```text
signed_out
-> authenticating
-> resolving_household
-> household_choice
   -> join_household
   -> create_household
-> household_ready
-> app
```

기존 member는 `resolving_household`에서 바로 `app`으로 이동한다.

### Screen 1: Google Sign-In

Sample의 introductory subscription sheet를 다음과 같이 적용한다.

- Promotional album art 대신 compact Jangoing mark 또는 kitchen artwork 표시
- Title은 `Your kitchen, shared`
- Inventory와 shopping data가 household에만 공개된다는 설명
- 하단에 full-width `Continue with Google` action 하나 제공
- OAuth 시작 중 progress를 표시하고 duplicate submit 방지
- Intended return location을 잃지 않는 retry 가능한 error 표시

권장 authenticated MVP에서는 consumer route에 household identity가 필요하므로
dismiss할 수 없게 한다. Close button은 isolated non-production data를 사용하는
명시적 anonymous demo mode를 추가하는 경우에만 적절하다.

### Screen 2: Household 선택

Sample의 plan-selection card를 적용한다. Reference에서 가장 직접적으로 재사용할 수
있는 부분이다.

가운데 `Set up your household` prompt와 다음 두 개의 큰 selectable row를 표시한다.

```text
Join an existing household
Use a code shared by someone at home

Create a new household
Start a new inventory and shopping list
```

한 번에 하나의 row만 선택할 수 있다. 선택한 row에는 기존 Jangoing accent fill
또는 tint와 circular checkmark를 표시한다. 선택 전에는 primary action을
disabled 상태로 유지하고, 선택 후에는 다음과 같이 변경한다.

- Join 선택: `Enter Household Code`
- Create 선택: `Create Household`

Back action은 sign-in으로 돌아가거나 sign out한다. Card tap 자체가 server mutation을
수행하게 하지 않는다. Selection과 confirmation을 분리해야 한다.

### Screen 3A: 기존 Household Join

Sample의 preference bubble이나 작은 native alert 대신 focused sheet form을
사용한다.

- Title: `Enter household code`
- 눈에 잘 띄는 uppercase code input 하나
- `ABCD-EFGH-JK` 형태의 automatic formatting
- Case, space, hyphen의 local normalization
- Code를 어디서 받는지 설명하는 짧은 helper text
- Local format이 valid할 때만 활성화되는 fixed `Join Household` action
- 반복 join request를 막는 loading state
- Invalid, expired, revoked code에 동일하게 사용하는 inline generic error

Join 성공 전에는 household name, owner, member list를 노출하지 않는다. Retry
가능한 network failure에서는 입력한 code를 유지하지만, onboarding을 벗어나거나
sign out하면 삭제한다.

### Screen 3B: 새 Household 생성

Sample의 account/settings sheet에 있는 grouped row를 적용한다.

- Title: `Create your household`
- Required `Household Name` row
- Product에서 별도 용도가 있을 때만 optional home/display label 제공
- Group 아래 inline validation
- Fixed `Create Household` action
- Duplicate creation을 방지하는 loading state

Household 생성, owner membership, initial join-code generation은 하나의 server
transaction으로 처리한다. 일부라도 실패하면 success로 이동하지 않는다.

### Screen 4: Household Ready

Sample의 compact completion state를 적용한다.

- Join member: `You joined {Household Name}`
- Creator: `Your household is ready`
- Optional compact household/avatar summary
- Primary `Open My Kitchen` action
- Creator에게만 join code와 `Share Code` 표시
- 지원되는 환경에서는 copy와 native share action 제공

이 화면은 completion screen이며 추가 setup questionnaire가 아니다. App을 열기
전에 category preference, fridge content, notification choice를 요구하지 않는다.
기존 fridge setup은 이후 household-level task로 실행할 수 있다.

### 이후 Household 관리

기존 Home profile placeholder를 sample의 grouped settings row를 사용하는 account
sheet로 변경한다.

- Signed-in profile
- Household name과 role
- Members
- Household code share 또는 generate
- Owner용 code rotate 또는 revoke
- Privacy와 data control
- Sign out

다른 화면으로 이동하는 row에는 secondary text와 chevron을 표시한다. Destructive
action은 별도 group과 destructive color를 사용한다. 지속적인 household 관리는 이
account surface가 담당하며, onboarding에는 household에 들어가기 위한 최소 단계만
포함한다.

### 적용하지 않을 Pattern

- Binary join/create decision에 animated preference-bubble interface를 사용하지
  않는다. 덜 직접적이고 accessibility가 낮으며 구현할 필요가 없다.
- Apple Music의 red accent, gradient, album imagery, subscription marketing
  language를 복사하지 않는다.
- Join code에 compact centered credential alert를 사용하지 않는다. Helper text,
  loading, recoverable error를 표시할 공간이 부족하다.
- Mandatory onboarding에서 같은 결과를 만드는 back과 close control을 동시에
  표시하지 않는다.
- 기존 Inventory와 Shopping List UI에 맞지 않는 큰 decorative card나 corner
  radius를 추가하지 않는다.

### Interaction 및 Accessibility 요구사항

- 기존 mobile maximum width 안에 content 배치
- Safe-area inset을 준수하고 keyboard 위에 bottom action 유지
- Step transition 후 screen title로 focus 이동
- Visible keyboard focus와 screen-reader label 제공
- Validation 및 server error announce
- Selection row나 action이 잘리지 않도록 Dynamic Type 지원
- Back navigation 시 선택한 join/create option 유지
- Household code 또는 authentication token을 local storage에 저장하지 않음
- Create/join mutation commit 중 dismiss 방지
- Sheet와 selection transition에서 reduced-motion preference 준수

### Onboarding 구현 상태

2026-09-02 구현 완료:

- Google authentication은 mandatory이며 onboarding gate를 dismiss해 anonymous
  app access로 들어갈 수 없다.
- 모든 valid Google account가 sign in할 수 있으며 subject 또는 email allowlist를
  적용하지 않는다.
- Signed-out, membership-resolution, household-choice, join, create,
  completion, authenticated-app state를 구현했다.
- 기존 household member는 onboarding을 건너뛴다.
- Household resolution 전에는 app page와 bottom navigation을 render하지 않는다.
- Join-code formatting, disabled submission, pending state, inline error, back
  navigation, title focus, safe area, reduced motion을 포함한다.
- Home profile control은 Google identity, household name, role, sign-out을
  제공하는 native full-screen account dialog를 연다.
- 인증된 user와 household data는 profile을 열 때 다시 fetch하지 않고 shared
  client context에 유지한다.
- Owner는 전용 invite screen에서 7일 household code를 생성하고, copy, native
  share, rotate 또는 revoke할 수 있다.
- Code를 생성하면 이전 active code가 revoke되며 plaintext code는 component
  memory에만 유지되고 dialog를 닫으면 제거된다.
- Owner는 dialog를 다시 연 뒤 plaintext code를 다시 표시하지 않고도 이전에
  공유한 code를 revoke할 수 있다.
- Member는 household와 role을 볼 수 있지만 owner code control은 표시되지
  않는다.
- Account dialog는 bottom에서 진입하고 같은 경로로 닫히며, reduced-motion
  user에게는 즉시 전환된다.
- 모든 joined user는 avatar, name, email, role이 표시되는 household member
  screen을 열 수 있다.
- Owner는 확인 후 non-owner member를 제거할 수 있고 member에게는 read-only
  list를 제공한다.
- Owner와 member role은 shared inventory와 shopping-list operation에 동일한
  read/write access를 가지며 role 제한은 household administration에만 적용한다.
- Recent search history는 device-local로 유지하지만 authenticated user ID별로
  namespace를 분리해 같은 browser의 account가 서로의 history를 보지 않게 한다.
  이 history는 device 간 synchronize되지 않는다.

Ownership transfer, household 나가기, account 삭제, privacy control은 이후
account 작업으로 남아 있다.

### Household Profile Customization 제안

Account dialog header는 일반적인 product account title 대신 현재 household
name을 사용한다. Household name과 icon은 모든 member에게 보이는 shared
metadata이므로 Google user profile과 분리해서 관리해야 한다.

권장 1단계:

- Owner가 기존 household name을 수정할 수 있게 한다.
- `households`에 nullable `icon_key`, `icon_color` field를 추가한다.
- Home, refrigerator, produce, meal, shopping 등의 작은 preset icon set과
  accessibility를 고려한 고정 color palette를 제공한다.
- Update를 validate하고 변경된 household summary를 반환하는 owner-only
  `PATCH /households/current` endpoint를 추가한다.
- Account dialog 안에 preview, name input, icon grid, Cancel, Save로 구성된
  `Edit Household` screen을 추가한다.
- 응답으로 shared household context를 갱신해 page reload 없이 header와
  profile row가 즉시 변경되게 한다.
- Member는 read-only로 유지한다.

Preset icon은 object storage, moderation, image processing, cleanup, signed
delivery URL이 필요하지 않으므로 image upload보다 먼저 적용하는 것을
권장한다. 이후 item media storage lifecycle이 마련되면 R2 기반 household
photo를 추가할 수 있으며, 이 단계에서도 preset icon은 fallback으로 유지한다.

구현 전 결정이 필요한 product 항목:

- 첫 release에서 preset icon과 color만 사용할지, image upload도 포함할지
- Household name을 unique하게 제한할지 여부(현재는 제한하지 않음)
- Member가 profile 변경을 제안할 수 있게 할지, owner만 수정 가능하게 할지

## Local Development

Google OAuth configuration:

```text
http://localhost:3000
http://localhost:3000/api/auth/callback/google
```

Production에는 대응되는 Vercel origin과 callback을 추가한다.

예상 web secret:

```text
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
APP_JWT_SECRET
APP_JWT_ISSUER
APP_JWT_AUDIENCE
```

예상 Worker secret/config:

```text
APP_JWT_SECRET
APP_JWT_ISSUER
APP_JWT_AUDIENCE
ALLOWED_ORIGINS
HOUSEHOLD_CODE_SECRET
```

Vercel과 Worker에서 같은 app-JWT 값을 사용하고 server-side로만 유지한다.

Automated development를 위해 local-only auth bypass를 추가할 수 있지만,
production에서는 명시적으로 비활성화해야 한다. 또한 authorization path를 실제로
검증할 수 있도록 bypass도 정상 household context를 생성해야 한다.

## Deployment 순서

1. Google OAuth application과 local/production callback URL 생성
2. Additive D1 migration 배포
3. `AUTH_REQUIRED=false` rollout flag 뒤에서 Worker token verification과
   household-aware query 배포
4. Explicit bootstrap household 생성 및 legacy consumer state 할당
5. Web login, app-token endpoint, household onboarding, authenticated API
   client 배포
6. Account 하나는 code로 join하고 다른 account는 household를 생성할 수 있는지 검증
7. Inventory, shopping, fridge setup, search, analytics, command confirmation이
   household별로 분리되는지 검증
8. `AUTH_REQUIRED=true` 설정
9. 검증 후 temporary unauthenticated compatibility path 제거

Migration과 Worker를 authenticated web client보다 먼저 배포한다. Rollout flag는
임시 수단이며 permanent bypass로 남기지 않는다.

## Test Plan

### Authentication

- Valid token accept
- Missing token은 `401`
- Expired token은 `401`
- Wrong signature, issuer, audience는 `401`
- First-login user upsert idempotency
- Google `sub`가 같으면 email이 바뀌어도 두 번째 user를 만들지 않음

### Household Onboarding

- Membership이 없는 authenticated user는 `household_required`를 받음
- Valid code는 intended household에 즉시 member access 부여
- Lowercase와 hyphen 없는 form도 같은 code로 normalize
- Invalid, expired, revoked code는 동일하게 거부
- Join attempt rate limit 적용
- 두 번 join해도 duplicate membership을 만들지 않음
- Active household가 있는 user는 MVP에서 다른 household join/create 불가
- Household creation은 owner membership과 join code를 atomically 생성
- Owner만 code rotate/revoke 가능
- Concurrent join/create request에서도 membership invariant 유지

### Authorization

- Household A는 household B event를 읽을 수 없음
- Household A는 household B inventory 또는 shopping state를 변경할 수 없음
- Event history와 analytics는 active household만 포함
- Fridge-setup status는 household별로 독립적
- Item name을 이용해 household boundary를 넘을 수 없음

### Data Integrity

- 모든 신규 consumer event에 `household_id` 존재
- Authenticated inference에 household/user provenance 기록
- Generated annotation import는 null household provenance로 계속 동작
- Legacy record가 선택한 migration policy를 따름
- Projection에는 household-filtered event만 전달

### Frontend

- Signed-out user는 consumer API call을 보내지 않음
- Sign-in 후 원래 app page로 복귀
- Membership이 없는 user에게 household-choice screen 표시
- Household choice는 continue 전 explicit selection 요구
- Back navigation 시 선택한 join/create choice 유지
- Join-code input이 household 정보를 노출하지 않고 format 및 validate
- Pending 중 join/create action duplicate submit 방지
- Completion에 joined 또는 created state를 올바르게 표시
- Onboarding 전체에서 keyboard, screen reader, Dynamic Type, safe area,
  reduced-motion 동작 검증
- Token refresh는 한 번만 retry
- Sign-out 시 visible inventory와 shopping data 제거
- Google profile field가 없어도 profile name/image UI가 정상 동작

## Privacy와 Account Lifecycle

제품에 필요한 identity data만 저장한다. Basic identity 외의 Google scope는
요청하지 않는다.

Public rollout 전에 다음을 정의한다.

- Account deletion
- Household data deletion
- Data export
- Account deletion 이후 de-identified annotation data retention
- Model-training use opt-out 여부
- Profile image caching policy

## Completion Gate

다음 조건을 모두 만족해야 authentication 구현이 완료된 것으로 본다.

- Google sign-in/sign-out이 local과 production에서 동작
- Membership이 없는 user에게 join-or-create onboarding 표시
- Valid household code로 기존 inventory와 shopping list에 접근 가능
- Code가 없는 user는 household를 만들고 owner join code를 받음
- Invalid, expired, revoked code는 access를 부여하지 않음
- 모든 consumer read/write가 household-scoped
- Test account 두 개가 서로의 data에 접근할 수 없음
- Fridge setup이 household별로 분리됨
- Inference provenance가 기록됨
- Annotation workflow가 계속 동작
- Legacy global state에 명시적 owner가 있거나 제거됨
- Unauthenticated rollout path가 비활성화됨

## Open Decisions

- 기존 production inventory를 어떤 Google account에 할당할 것인가?
- Active seven-day join code가 expiration 전 unlimited join을 허용할 것인가,
  maximum use count를 둘 것인가?
- Owner가 household code를 rotate, revoke, generate하는 UI를 어디에 둘 것인가?
- `/annotate`를 public으로 둘 것인가, 별도 admin token을 사용할 것인가, authorized
  account를 요구할 것인가?
- Household switching, ownership transfer, leave household는 언제 추가할
  것인가?
- Account deletion 이후 user-generated language를 research에 유지할 것인가? 유지한다면
  어떤 de-identification policy를 적용할 것인가?
