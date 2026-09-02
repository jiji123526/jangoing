# Temporary Google Authentication and Household Data Plan

Status: temporary implementation plan  
Created: 2026-09-02

## Purpose

This document defines the implementation sequence for adding Google login and
personalized inventory and shopping-list data to Jangoing.

It is temporary. After rollout, durable architectural decisions should move to
a decision record, completed work should move to the progress log, and this
file should be removed or reduced to remaining follow-up work.

## Current State

The current product has no authentication or authorization layer.

- The Next.js web app calls the Cloudflare Worker directly.
- The Worker accepts consumer requests without identity.
- The D1 `events` table is global.
- Inventory and shopping lists are projections over all events.
- `app_state` uses a global key, including fridge-setup completion.
- Inference logs do not identify the user or household that produced them.
- Annotation infrastructure is currently separate from consumer identity.

Adding only a Google sign-in button would not create personalized data. Every
consumer read and write must also be scoped to an authenticated household.

## Recommended MVP Architecture

```text
Google OAuth
-> Auth.js session in the Next.js app
-> same-origin endpoint issues a short-lived Jangoing app JWT
-> browser sends Authorization: Bearer <token> to the Worker
-> Worker verifies the token and resolves the user in D1
-> user joins a household by code or creates a new household
-> Worker resolves the active household membership
-> every consumer query is filtered by household_id
```

The Google access token must not be used as the regular Worker API credential.
Jangoing should issue its own short-lived token containing only the identity
claims needed by the application.

For the first release:

- Google login creates or updates only the user identity;
- a user with no membership is asked whether they have a household code;
- a valid code grants immediate member access to the existing household;
- a user without a code creates a new household and becomes its owner;
- each user has one active household;
- household switching is not supported yet;
- inventory and shopping data belong to the household;
- events retain the user who caused the change;
- annotation remains a separate research/admin surface.

Google login must not auto-create a household. This prevents duplicate household
lists when another member already has the shared inventory. Existing members
skip onboarding and open their household directly.

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

`google_subject` is the stable Google `sub` claim. Email must not be used as the
identity key because a user can change email while retaining the same provider
identity.

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

Add indexes for lookup by `user_id` and `household_id`.

### Household Join Codes

Use a revocable join credential rather than exposing the household ID.

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

Recommended code policy:

- generate at least 50 bits of cryptographic randomness;
- display a readable uppercase code such as `ABCD-EFGH-JK`;
- normalize case and separators before verification;
- store only a keyed hash using a Worker secret;
- show plaintext only when generated;
- expire codes after seven days;
- let an owner rotate or revoke the active code;
- rate-limit join attempts by both authenticated user and IP;
- return one generic invalid-code response without revealing household details.

The code grants immediate `member` access, so it must be treated as a bearer
credential. It is not a permanent household identifier or a substitute for the
authenticated user session.

### Events

Add:

```text
household_id
created_by_user_id
```

`household_id` determines ownership. `created_by_user_id` is provenance and may
be nullable for system-generated, imported, or migrated records.

Every event query must include the authenticated `household_id`. Projection
functions can remain household-agnostic because they receive an already
filtered event list.

### Household App State

The current global `app_state.key` primary key cannot represent the same key for
multiple households. Replace it with a household-scoped table:

```sql
CREATE TABLE household_app_state (
  household_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, key)
);
```

Fridge-setup completion must use this table.

### Inference Provenance

Add nullable fields to `inference_logs`:

```text
household_id
user_id
```

Authenticated consumer interactions populate them. Generated review imports and
legacy research records may remain null. Annotation records should continue to
point to inference records rather than duplicating household identity.

## Migration Sequence

Use separate migrations so schema rollout and data migration can be inspected
independently.

1. Create `users`, `households`, `household_memberships`, and
   `household_join_codes`.
2. Add nullable household and user columns to `events`.
3. Add household and user columns to `inference_logs`.
4. Create `household_app_state`.
5. Add household and join-code indexes.
6. Backfill or remove legacy consumer records according to the selected policy.
7. Enforce required household ownership for new consumer writes in application
   code.

D1/SQLite table rebuilding may be required later if `household_id` must become
physically `NOT NULL`. The application should enforce the invariant first and
the schema can be tightened after production verification.

### Schema Phase Status

Implemented on 2026-09-02:

- `0012_add_household_ownership.sql` creates users, households, memberships,
  join codes, and household-scoped app state;
- existing event and inference ownership columns are additive and nullable, so
  legacy rows remain valid until the bootstrap migration;
- household lookup, join-code expiry, event ownership, and inference
  provenance indexes are present;
- the Node-based local API bootstrap applies the migration to existing local
  databases when the `users` table is absent;
- schema tests cover legacy-row compatibility, role and foreign-key
  constraints, and household app-state isolation.

The migration has been applied to the repository's Node/SQLite local database.
It has not been applied to remote D1. Step 7 is implemented in application
code; step 6 remains pending until the legacy-data owner is selected.

## Legacy Data Decision

Choose one policy before applying the data migration:

- **Reset consumer state:** delete existing consumer events and let each account
  start with fridge setup.
- **Assign to a bootstrap account:** create one user/household and backfill all
  existing consumer events to it.
- **Preserve as demo data:** move existing events to an explicitly named demo
  household that is never returned to normal users.

Recommended for the current production instance: create an explicit bootstrap
household, assign existing consumer state to it, and preconfigure its owner
Google subject. Other members then join that same household using a generated
code. Preserve annotation and inference research data separately.

The migration must never assign global data to whichever user happens to sign
in first without an explicit configured email or Google subject.

### Selected Legacy Policy and Tooling

Selected on 2026-09-02:

- create the bootstrap household as `Jiwoo's Home`;
- assign every null-household consumer event to that household;
- leave legacy event `created_by_user_id` null because the original actor is
  not provable;
- assign only null-household inference logs whose source is exactly `web` to
  the household and owner;
- leave generated, annotation-review, and every non-`web` inference source
  unassigned;
- copy legacy global app-state values into the household app-state table
  without deleting the original rollback copy.

`apps/api/scripts/backfill-bootstrap-household.ts` implements this policy. It is
remote-only and dry-run by default. Before applying, it requires all household
tables, exactly one signed-in user matching the supplied email, no existing
membership for that user, and no existing household named `Jiwoo's Home`.
Application requires both `--apply` and an exact
`--confirm "Jiwoo's Home"`. It verifies assigned row counts after the D1 file
transaction.

The tool has not been run. The owner must first complete Google login so the
Worker creates a user linked to the stable Google `sub`.

## Web Authentication

Add Auth.js to `apps/web` with the Google provider.

Expected files:

```text
apps/web/auth.ts
apps/web/app/api/auth/[...nextauth]/route.ts
apps/web/app/api/app-token/route.ts
```

The Auth.js callbacks should:

- retain the Google `sub` claim;
- expose only required profile fields to the server session;
- avoid storing Google access or refresh tokens unless a future Google API
  integration actually needs them;
- reject accounts outside an optional allowlist during the private MVP.

The app-token route should:

- require a valid server-side Auth.js session;
- issue a token with a short lifetime, initially 10 minutes;
- include `sub`, `iss`, `aud`, `iat`, and `exp`;
- optionally include display profile claims for user upsert;
- never place the token in local storage.

The browser may cache the app token in memory and refresh it through the
same-origin endpoint before expiration.

### Web Authentication Phase Status

Implemented on 2026-09-02:

- Auth.js v5 uses Google OAuth with encrypted JWT sessions;
- the Google `sub` is retained in the server-readable Auth.js token and is not
  added to the public browser session object;
- `/api/app-token` requires the Auth.js session and issues a ten-minute HS256
  Jangoing token with the Worker issuer and audience;
- the API client caches the app token only in module memory, refreshes before
  expiry, and retries one Worker `401`;
- signed-out requests retain temporary anonymous compatibility while
  `AUTH_REQUIRED=false`;
- token signing has a test for HS256 signature, claim shape, and ten-minute
  expiry.

Google OAuth credentials, production secrets, login UI, route gating, and the
optional private-MVP allowlist are not configured or implemented yet.

## Worker Authentication

Add a small authentication module in the Worker.

Responsibilities:

- parse the bearer token;
- verify signature, algorithm, issuer, audience, and expiration;
- reject missing or invalid credentials with `401`;
- upsert the Google-linked user on first authenticated access;
- return an explicit `household_required` state when the user has no membership;
- join an existing household by verified code in one transaction;
- create a household, owner membership, and initial join code in one transaction;
- resolve exactly one active membership for consumer routes;
- provide `{ userId, householdId, role }` to household route handlers.

Add `Authorization` to the allowed CORS headers.

Do not accept `user_id`, `household_id`, or email from request bodies or query
parameters as authority. Those values must come from the verified token and D1
membership lookup.

### Worker Authentication Phase Status

Implemented on 2026-09-02:

- `apps/api/src/auth.ts` verifies Jangoing HS256 app JWTs with Web Crypto;
- verification requires the configured algorithm, signature, issuer, audience,
  Google `sub`, email, issued-at time, and expiry;
- tokens may live for at most 15 minutes and future-issued or expired tokens
  are rejected;
- the stable Google `sub`, not email, is used to upsert the user;
- profile changes update the existing user without replacing a stored name or
  avatar with missing claims;
- membership resolution rejects multiple memberships during the
  single-household MVP;
- consumer routes pass through the auth boundary while health and annotation
  routes retain their current policy;
- malformed supplied credentials are rejected even while rollout auth is
  optional;
- `Authorization` is included in CORS preflight responses;
- `wrangler.toml` defines `AUTH_REQUIRED=false`, `jangoing-web` as issuer, and
  `jangoing-api` as audience without storing the signing secret.

When `AUTH_REQUIRED=true`, a missing credential returns
`authentication_required`, an invalid credential returns `invalid_token`, and
an authenticated user without membership returns `household_required`.

The resolved identity and household now scope consumer event, inference, and
fridge-state access. `AUTH_REQUIRED` remains `false` until remote schema
migration, legacy-data backfill, Worker secrets, and the web token issuer are
ready. The app JWT signing secret has not been configured in Worker production.

## Route Policy

Authenticated users without a household may access only:

```text
GET  /households/current
POST /households/join
POST /households/create
```

Household owners may also access:

```text
POST /households/join-code
POST /households/join-code/revoke
```

`POST /households/join` accepts a code and adds the authenticated user as a
member. `POST /households/create` creates a named household, owner membership,
and initial join code. Both endpoints must reject users who already have an
active membership in the single-household MVP.

Require authentication for consumer routes:

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

Every handler must use the authenticated household for all reads and writes.

Keep annotation routes outside this policy temporarily, but do not treat that as
the final security model. A later admin authorization decision is required for:

```text
/annotations/*
dataset export
queue seeding
generated-review import
```

### Household API Phase Status

Implemented on 2026-09-02:

- `GET /households/current` returns the application profile and current
  household without exposing the Google `sub`;
- `POST /households/create` atomically creates the household, owner membership,
  and initial seven-day join code;
- `POST /households/join` atomically inserts membership only when the supplied
  code is active and unexpired;
- `POST /households/join-code` lets owners revoke existing active codes and
  issue a replacement;
- `POST /households/join-code/revoke` lets owners invalidate active codes
  without issuing another;
- join codes contain 50 bits of cryptographic randomness, use a readable
  `ABCD-EFGH-JK` format, and are stored only as HMAC-SHA256 hashes;
- invalid, expired, and revoked codes return the same
  `invalid_household_code` response;
- migration `0013_enforce_single_household_membership.sql` prevents concurrent
  requests from assigning one user to multiple households;
- shared contracts validate household names, join-code input, household roles,
  profile responses, and household summaries.

All household routes require a valid app JWT even while consumer auth is in
optional rollout mode. `HOUSEHOLD_CODE_SECRET` is not yet configured remotely.
Per-user and per-IP join-attempt rate limiting remains required before public
deployment.

### Household Data-Scoping Phase Status

Implemented on 2026-09-02:

- event history, inventory, and shopping-list projections read only events
  whose `household_id` matches the authenticated membership;
- inventory, shopping, confirmed-command, and fridge-setup event writes store
  both `household_id` and `created_by_user_id`;
- command interpretation stores household and user provenance on inference
  logs;
- inference outcomes and confirmed events can resolve only pending inferences
  from the same household;
- fridge-setup completion uses `household_app_state` for authenticated
  households;
- an authenticated user without membership receives `household_required` even
  while rollout auth is optional;
- temporary anonymous rollout traffic can access only legacy records where
  `household_id IS NULL`, never authenticated household records;
- public event queries select explicit contract fields so internal ownership
  columns are not exposed in API responses.

SQLite-backed request tests verify isolation between household A, household B,
and anonymous legacy data for inventory, mutation ownership, inference
outcomes, and fridge-setup state.

Application-level isolation is complete, but production activation is not.
Remote migrations, explicit legacy-data ownership, secret configuration, and
the web app-token issuer must be completed before `AUTH_REQUIRED=true`.

## Frontend Changes

Update the web app to:

- show a Google sign-in screen when no Auth.js session exists;
- check household membership immediately after authentication;
- show `Do you have your household code?` when no membership exists;
- route `Yes` to a household-code field and immediate join action;
- route `No` to household creation;
- show the initial join code to the owner after creation;
- load consumer data only after membership is resolved;
- add the app JWT to Worker requests in `apps/web/lib/api.ts`;
- handle `401` by refreshing the app token once, then returning to sign-in;
- turn the existing profile placeholder into an account menu;
- support sign out;
- clear household data from client state on sign out;
- keep tokens out of persistent browser storage.

An invalid, expired, or revoked code must keep the user in onboarding and show a
generic error. The UI must not reveal the household name or member list before
the join succeeds.

The signed-out screen should be a functional authentication gate, not a
marketing landing page.

## Onboarding UI Plan

Use the Apple Music iOS onboarding sample as an interaction reference, not as a
new visual identity. The useful pattern is a layered mobile sheet with fixed
navigation, one decision per screen, a clear selected state, and a stable
primary action at the bottom.

Reuse the structure of the existing `FridgeSetupDialog`:

- native dialog and mobile-width sheet behavior;
- fixed header with back, title or progress, and conditional close;
- scrollable content area;
- fixed footer for the primary action;
- the existing Jangoing colors, typography, spacing, and compact corner radii.

Do not introduce a second onboarding dialog framework. Authentication and
household setup should use the same shell while replacing the fridge-setup
content with the following state machine:

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

An existing member moves directly from `resolving_household` to `app`.

### Screen 1: Google Sign-In

Adapt the sample's introductory subscription sheet:

- show a compact Jangoing mark or kitchen artwork, not promotional album art;
- use the title `Your kitchen, shared`;
- explain that inventory and shopping data are private to the household;
- provide one full-width `Continue with Google` action at the bottom;
- show progress while OAuth is starting and prevent duplicate submissions;
- show a retryable error without losing the intended return location.

The recommended authenticated MVP is not dismissible because consumer routes
require a household identity. A close button is appropriate only if an explicit
anonymous demo mode is added with isolated, non-production data.

### Screen 2: Household Choice

Adapt the sample's plan-selection cards. This is the strongest direct reuse
from the reference.

Display the centered prompt `Set up your household` and two large selectable
rows:

```text
Join an existing household
Use a code shared by someone at home

Create a new household
Start a new inventory and shopping list
```

Only one row may be selected. The selected row receives the existing Jangoing
accent fill or tint and a circular checkmark. The primary action remains
disabled until a choice is made and then changes to:

- `Enter Household Code` for join;
- `Create Household` for create.

The back action returns to sign-in or signs out. Do not make the card tap itself
perform the server mutation; selection and confirmation must remain separate.

### Screen 3A: Join Existing Household

Use a focused sheet form rather than the sample's preference bubbles or a small
native alert.

- title: `Enter household code`;
- one prominent uppercase code input;
- automatic formatting such as `ABCD-EFGH-JK`;
- local normalization of case, spaces, and hyphens;
- short helper text explaining where the code comes from;
- fixed `Join Household` action, disabled until the local format is valid;
- loading state that prevents repeated join requests;
- an inline generic error for invalid, expired, or revoked codes.

Do not reveal the household name, owner, or member list before a successful
join. Preserve the entered code after a retryable network failure, but clear it
when the user leaves onboarding or signs out.

### Screen 3B: Create New Household

Adapt the grouped rows from the sample's account/settings sheets:

- title: `Create your household`;
- required `Household Name` row;
- optional home/display label only if the product has a distinct use for it;
- inline validation under the group;
- fixed `Create Household` action;
- loading state that prevents duplicate creation.

Household creation, owner membership, and initial join-code generation are one
server transaction. Do not continue to success if any part fails.

### Screen 4: Household Ready

Adapt the sample's compact completion state:

- joined member: `You joined {Household Name}`;
- creator: `Your household is ready`;
- optional compact household/avatar summary;
- primary `Open My Kitchen` action;
- creator-only join-code display with `Share Code`;
- copy and native share actions where supported.

This is a completion screen, not another setup questionnaire. Do not require
category preferences, fridge contents, or notification choices before opening
the app. Existing fridge setup can run afterward as a household-level task.

### Later Household Management

Turn the existing Home profile placeholder into an account sheet using the
sample's grouped settings rows:

- signed-in profile;
- household name and role;
- members;
- share or generate household code;
- rotate or revoke code for owners;
- privacy and data controls;
- sign out.

Rows that navigate show secondary text and a chevron. Destructive actions use a
separate group and destructive color. This account surface owns ongoing
household management; onboarding should contain only the minimum required to
enter a household.

### Patterns Not to Adopt

- Do not use the animated preference-bubble interface for a binary join/create
  decision. It is less direct, harder to access, and unnecessary to implement.
- Do not copy Apple Music's red accent, gradients, album imagery, or
  subscription marketing language.
- Do not use a compact centered credential alert for the join code; it leaves
  insufficient room for helper text, loading, and recoverable errors.
- Do not show both back and close controls when onboarding is mandatory and
  they produce the same result.
- Do not add large decorative cards or corner radii that conflict with the
  established Inventory and Shopping List UI.

### Interaction and Accessibility Requirements

- keep content within the existing mobile maximum width;
- respect safe-area insets and keep the bottom action visible above the
  keyboard;
- move focus to the screen title after a step transition;
- provide visible keyboard focus and screen-reader labels;
- announce validation and server errors;
- support Dynamic Type without clipping selection rows or actions;
- preserve the selected join/create choice when navigating back;
- do not persist the household code or authentication token in local storage;
- prevent dismissal while a create or join mutation is being committed;
- honor reduced-motion preferences for sheet and selection transitions.

### Onboarding Implementation Status

Implemented on 2026-09-02:

- Google authentication is mandatory and the onboarding gate cannot be
  dismissed into anonymous app access;
- any valid Google account may sign in; no subject or email allowlist is
  applied;
- signed-out, membership-resolution, household-choice, join, create,
  completion, and authenticated-app states are implemented;
- existing household members skip onboarding;
- app pages and bottom navigation do not render before household resolution;
- join-code formatting, disabled submission, pending state, inline errors,
  back navigation, title focus, safe areas, and reduced motion are included;
- the Home profile control opens a native full-screen account dialog with
  Google identity, household name, role, and sign-out;
- authenticated user and household data are retained in a shared client
  context instead of being fetched again when the profile opens;
- owners can open a dedicated invite screen, generate a seven-day household
  code, copy it, invoke the native share surface, rotate it, or revoke it;
- generating a code revokes any prior active code, and plaintext codes remain
  only in component memory and are cleared when the dialog closes;
- owners can revoke previously shared codes after reopening the dialog without
  requiring the plaintext code to be displayed again;
- members can view their household and role but do not receive owner code
  controls.

Member listing and removal, ownership transfer, leaving a household, account
deletion, and privacy controls remain later account work.

## Local Development

Google OAuth configuration needs:

```text
http://localhost:3000
http://localhost:3000/api/auth/callback/google
```

Production needs the equivalent Vercel origin and callback.

Expected web secrets:

```text
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
APP_JWT_SECRET
APP_JWT_ISSUER
APP_JWT_AUDIENCE
```

Expected Worker secrets/config:

```text
APP_JWT_SECRET
APP_JWT_ISSUER
APP_JWT_AUDIENCE
ALLOWED_ORIGINS
HOUSEHOLD_CODE_SECRET
```

Use the same app-JWT values in Vercel and the Worker. Keep them server-side.

A local-only auth bypass may be added for automated development, but it must be
explicitly disabled in production and must still create a normal household
context so authorization paths are exercised.

## Deployment Order

1. Create the Google OAuth application and local/production callback URLs.
2. Deploy additive D1 migrations.
3. Deploy Worker token verification and household-aware queries behind an
   `AUTH_REQUIRED=false` rollout flag.
4. Create the explicit bootstrap household and assign legacy consumer state.
5. Deploy the web login, app-token endpoint, household onboarding, and
   authenticated API client.
6. Verify that one account can join by code and another can create a household.
7. Verify inventory, shopping, fridge setup, search, analytics, and command
   confirmation are isolated by household.
8. Set `AUTH_REQUIRED=true`.
9. Remove the temporary unauthenticated compatibility path after verification.

The migration and Worker must deploy before the authenticated web client. The
rollout flag is temporary and must not become a permanent bypass.

## Test Plan

### Authentication

- valid token is accepted;
- missing token returns `401`;
- expired token returns `401`;
- wrong signature, issuer, or audience returns `401`;
- first-login user upsert is idempotent;
- email changes do not create a second user when Google `sub` is unchanged.

### Household Onboarding

- an authenticated user with no membership receives `household_required`;
- a valid code grants immediate member access to the intended household;
- lowercase and hyphenless forms normalize to the same code;
- invalid, expired, and revoked codes are rejected identically;
- join attempts are rate-limited;
- joining twice does not create duplicate membership;
- a user with an active household cannot join or create another in the MVP;
- household creation atomically creates owner membership and a join code;
- only owners can rotate or revoke codes;
- concurrent join/create requests preserve membership invariants.

### Authorization

- household A cannot read household B events;
- household A cannot mutate household B inventory or shopping state;
- event history and analytics include only the active household;
- fridge-setup status is independent per household;
- item names cannot be used to cross household boundaries.

### Data Integrity

- every new consumer event has `household_id`;
- authenticated inferences record household and user provenance;
- generated annotation imports still work with null household provenance;
- legacy records follow the selected migration policy;
- projections receive only household-filtered events.

### Frontend

- signed-out users do not issue consumer API calls;
- sign-in returns to the intended app page;
- users without a membership see the household-choice screen;
- household choice requires an explicit selection before continuing;
- back navigation preserves the selected join/create choice;
- join-code input formats and validates without exposing household information;
- join/create actions cannot be submitted twice while pending;
- completion shows the correct joined or created state;
- keyboard, screen-reader, Dynamic Type, safe-area, and reduced-motion behavior
  work throughout onboarding;
- token refresh retries once;
- sign-out clears visible inventory and shopping data;
- profile name and image handle missing Google profile fields.

## Privacy and Account Lifecycle

Store only the identity data required by the product. Do not request Google
scopes beyond basic identity.

Before public rollout, define:

- account deletion;
- household data deletion;
- data export;
- retention of de-identified annotation data after account deletion;
- whether a user can opt out of model-training use;
- profile image caching policy.

## Completion Gate

Authentication is complete only when:

- Google sign-in and sign-out work locally and in production;
- users without membership see join-or-create onboarding;
- a valid household code grants access to the existing inventory and shopping
  list;
- users without a code can create a household and receive an owner join code;
- invalid, expired, and revoked codes do not grant access;
- every consumer read and write is household-scoped;
- two test accounts cannot access each other's data;
- fridge setup is household-specific;
- inference provenance is recorded;
- annotation workflows still operate;
- legacy global state has an explicit owner or has been removed;
- the unauthenticated rollout path is disabled.

## Open Decisions

- Which Google account receives the existing production inventory?
- Should active seven-day join codes allow unlimited joins until expiration or
  have a maximum use count?
- Where should owners rotate, revoke, and generate household codes?
- Should `/annotate` remain public, use a separate admin token, or require an
  authorized account?
- When should household switching, member removal, and leaving a household be
  added?
- Should user-generated language remain available for research after account
  deletion, and under what de-identification policy?
