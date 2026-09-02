# jangoing 계획서

## Product Summary

jangoing은 model-first conversational kitchen intelligence system이다. 주된 목적은
실제 reviewed interaction을 바탕으로 language model과 recommendation model을
학습하고, 검증하고, 비교하는 것이다. 이 제품은 everyday conversation 속에서
발견되는 request를 contextual하고 explainable한 kitchen action 및
recommendation proposal로 바꾼다.

학술적 목표, 연구 질문, 방법론 선택, 타당도 위협은
[ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md](../decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)에
정리되어 있다.

프로젝트는 text-based product로 시작한다. Raspberry Pi audio와 trained
language-understanding model은 command, confirmation, storage, correction
workflow가 검증된 뒤에만 추가한다.

## Product Goals

- cooking이나 cleanup 중에도 쓸 수 있을 정도로 kitchen inventory update를 빠르게 만든다.
- in-stock, low-stock, consumed, discarded, shopping-list action을 추적한다.
- 개별 inventory batch에 optional expiry date를 지원한다.
- 상태를 바꾸는 모든 action이 review와 correction 가능하도록 유지한다.
- 이후 model training에 쓸 고품질 English command data를 수집한다.
- model progress가 version별로 재현 가능하고 추적 가능하도록 모든 inference와
  outcome을 기본적으로 log한다.
- goal, preference, household state, ambiguity를 포함한 자연스러운 multi-turn
  conversation에서 relevant request를 감지하고 context를 해소한다.
- dietary, budget, freshness, safety rule을 지키면서 meal, product,
  substitution, shopping deal에 대한 explainable recommendation을 제공한다.
- frozen offline set, slice metric, calibration, latency, correction behavior,
  monitored online outcome으로 모든 release를 계량화한다.

## Engineering Priority

model evaluation loop가 나중 analytics feature가 아니라 시스템의 중심이다.

```text
interaction -> versioned inference log -> user review/correction
            -> versioned dataset -> reproducible training run
            -> frozen + slice evaluation -> deployment decision
            -> production outcome monitoring -> next dataset
```

필요한 record, metric, privacy constraint, promotion gate는
[MODEL_EVALUATION.md](../ml/MODEL_EVALUATION.md)를 본다.

## Current Implementation Status

text MVP는 구현되었고 배포 가능하다.

- Vercel 위의 Next.js web app
- D1을 쓰는 Cloudflare Worker API
- local Node SQLite development API
- shared Zod contract
- append-only event storage와 inventory projection
- command interpretation preview와 explicit confirmation
- optional expiry date picker
- unit test가 있는 deterministic English parser
- editable interpretation review와 correction record
- versioned inference logging과 reviewed JSONL export
- 재현 가능한 800-record English `synthetic-v1` dataset
- TF-IDF + logistic-regression single-intent baseline
- exact span을 지원하는 public production `/annotate` workspace
- first-class relevance와 action-specific intent, phrase family, entity,
  normalized value를 가진 multi-action group을 저장하는 `annotation-v3`
- controlled phrase family와 함께 동작하는 dynamic normalized-value suggestion
- correction, expiry-heavy, low-confidence, confirmed, evaluation-holdout
  sample용 prioritized annotation queue
- contextual preference, domain-adjacent non-actionable language, small
  unrelated negative set을 위한 generated relevance review queue
- 35개 phrase family에 걸친 재현 가능한 600-record
  `relevance-candidates-v1` review corpus
- easy unrelated negative보다 domain hard negative를 우선하는 candidate 구성
- proposal tracking과 parser fallback이 있는 assistant-generated annotation draft
- training candidate(100–200 목표), evaluation candidate(100+ 목표)를 위한
  production counter
- cross-split text/phrase-family leakage check가 포함된 train/evaluation 분리
  reviewed dataset export
- inference request context와 reviewed export에 저장되는 optional
  conversation, turn, speaker, activation metadata
- locally recoverable draft, atomic bulk event write, explicit persisted
  completion state를 갖춘 first-run fridge setup
- user photo를 artwork로 먼저 쓰고, 이후 confirmation-gated vision과 catalog
  retrieval로 확장하는 planned item-media pipeline

현재 language layer는 rule-based다. 소수의 sentence pattern만 인식하며, 폭넓은
natural-language understanding을 표현하지는 못한다.

### Current Parser Limits

- `expiring tomorrow`, `expires next Friday`,
  `with expiry date on August twenty-eighth` 같은 natural-language expiry phrase는
  파싱되지만, 문장이 그것을 expiry information으로 명시했을 때만 가능하다.
- inline ISO expiry date는 여전히 동작하며 가장 deterministic한 입력 형식이다.
- 지원하지 않는 phrase는 date phrase가 explicit expiry marker 없이 등장할 때
  특히 `item_name`에 흡수될 수 있다.
- 지원 unit은 bag, bottle, can, carton, dozen, jar, pack, piece로 제한된다.
- number word는 one부터 ten, 그리고 `a`, `an`, digit, decimal 정도만 지원한다.
- item alias normalization은 의도적으로 작은 범위만 포함한다.
- pattern confidence score는 상수이며 통계적으로 calibration되지 않았다.
- valid interpretation attempt는 confirmation 전에 pending, confirmed,
  corrected, cancelled, rejected, annotated outcome까지 포함해 log된다.

이 한계는 상태를 바꾸는 모든 action이 user review를 거치는 동안에만 허용 가능하다.

### Current Data Gaps

- annotation storage와 production annotation UI는 이제 `actionable`,
  `contextual_preference`, `domain_non_actionable`, `unrelated`를 분리한다.
- reviewed export는 이 네 relevance class를 모두 유지하는 전용 `relevance`
  task를 지원하며, `intent`, `slots`, `joint`는 non-actionable record를 제외한다.
- synthetic generation은 이미 entity span과 normalized value를 포함하므로,
  entity-label support 자체가 blocker는 아니다.
- runtime parsing은 이제 explicit natural-language expiry phrase를 위해 shared
  temporal grounding을 사용한다. reference date가 없으면 validated user
  timezone 기준 request timestamp에서 추론하고, 없으면 UTC를 fallback으로 쓴다.
- deterministic queue seed v2는 각 expiry phrase에 explicit reference date,
  timezone, verified ISO result를 부여하며, 기존 record를 덮어쓰지 않는
  namespace를 사용한다.
- reviewed export는 이제 train/evaluation split을 분리하고 `relevance`,
  `intent`, `slots`, `joint`에 대한 task-aware filtering을 지원한다.
- effective `reference_date`와 validated `timezone`은 inference request context와
  reviewed export 전체에 저장된다. assistant prompt v6와 expiry queue
  annotation은 이 original temporal context를 노출하고 사용한다.
- `conversation_id`, `turn_index`, `speaker_role`, `activation_mode`를 log하고
  export할 수 있지만, 아직 prior turn을 소비하는 context resolver는 없다.
- reviewed annotation은 ITEM, ITEM_CONDITION, CATEGORY, UNIT, LOCATION,
  EXPIRY_DATE에 대해 normalized-value completeness를 강제한다.
- ITEM, ITEM_CONDITION, CATEGORY, UNIT normalized value는 reviewed annotation
  history에서 직접 확장될 수 있지만, canonical drift governance는 아직 수동이다.
- annotation schema는 `ripe`, `frozen`, `spoiled` 같은 modifier를 위해
  `ITEM_CONDITION`을 지원하지만, parser/runtime이 그 signal을 소비하는 것은
  나중 단계다.
- synthetic bootstrap dataset은 `ripe bananas` 같은 condition phrase를 item
  alias 내부에 숨기지 않지만, condition-sensitive slot training을 위한
  포괄적인 `ITEM_CONDITION` span label은 아직 내보내지 않는다.
- assistant draft는 labeling을 가속할 수 있지만 human review를 대체하지 못하고,
  span별 calibrated confidence도 아직 제공하지 않는다. prompt v6는 original
  temporal context를 받고, server code는 model-generated calendar date를
  신뢰하지 않고 expiry span을 deterministic하게 normalize한다.
- single-action baseline gate는 아직 first-class export flag가 아니라 ML code
  안에 암묵적으로 들어 있다.
- relevance queue candidate는 deterministic v1 corpus를 갖고 있지만, 이것도
  template-generated routing data일 뿐이다. human review와 독립적인 natural
  evaluation utterance는 여전히 필요하다.

## MVP Boundary

### Included

- authentication 없는 single household
- English text command
- deterministic intent/slot parsing
- event 저장 전 confirmation
- projection-based Kitchen Briefing, item-level Recently Updated card, Home에서만
  보이는 mini-player를 가진 Apple Music 기반 Home
- 이후 authentication과 account routing을 위해 비워 둔 Home account/profile
  placeholder
- projection에서 계산되는 Today priority, confirmable Suggested Action,
  Inventory Snapshot, expiry 순 Waste Prevention, consume-first leftover
  prioritization
- 여러 current item을 입력하고 quantity, unit, location, expiry, low threshold를
  검토한 뒤 snapshot을 atomic하게 저장하는 first-run `Set Up My Fridge`
  onboarding
- Weekly Summary는 Home에 역사 리포트를 늘리지 않고 별도 analytics tab으로 보류
- consumer navigation의 center tab은 `/analytics`를 노출하며, 내부용
  `/annotate` workspace는 direct URL로만 접근 가능하고 product UI link는 없다
- 다섯 consumer tab, bottom navigation, Home mini-player는 footer surface와
  divider까지 포함해 fluid 430px maximum shell을 사용하며, annotation
  workspace는 desktop width를 유지한다
- Search는 read-only lookup이며, Apple Music의 focus-to-chip transition을
  적용한 sliding Inventory / Shopping List scope와 scope-specific status chip을
  제공한다
- Weekly Analytics는 default recent-50 dashboard history 대신
  `GET /events?since=<ISO timestamp>`로 complete event window를 요청한다
- inventory와 shopping-list view
- item 추가 시 optional expiry date
- expiring-soon / expired status 계산
- Cloudflare Worker API와 D1
- Vercel의 Next.js mobile web app

### Excluded

- Raspberry Pi audio, wake-word detection, speech-to-text
- trained intent model 또는 slot model
- multi-user authentication
- push notification
- barcode 또는 camera input
- user-photo artwork와 vision recognition. 단계적 security, R2/D1, confirmation,
  evaluation plan은
  [ITEM_MEDIA_AND_VISION_PLAN_KO.md](./ITEM_MEDIA_AND_VISION_PLAN_KO.md)에 정의되어 있다
- native mobile app
- automatic shelf-life prediction
- MVP 단계에서의 multi-turn conversational context와 recommendation ranking.
  둘 다 post-MVP의 핵심 목표로 남겨 둔다.

## Primary User Flow

초기 household setup:

1. Home이 persisted `fridge_setup_completed_at` application state를 확인한다.
2. setup이 끝나지 않은 household에는 Today section보다 먼저
   `Set Up My Fridge`가 보인다.
3. 사용자는 여러 current item을 입력하고 각 item detail을 검토한다.
4. API는 full snapshot을 검증하고, 모든 setup event와 completion state를 한
   transaction으로 쓴다.
5. 이미 추적 중인 item은 adjusted되고, 새 item은 added된다. setup에서 빠진 기존
   item은 변경되지 않는다.
6. setup event는 `source = fridge_setup`을 사용하고 inference logging을 건너뛰므로,
   form으로 입력한 bootstrap data는 NLP training data가 되지 않는다.

지속적인 natural-language update:

1. 사용자가 `Add two cartons of milk`를 입력한다.
2. 사용자는 optional expiry date를 선택할 수 있다.
3. API가 structured interpretation을 반환한다.
4. web app이 proposed action을 보여 준다.
5. 사용자는 confirm하거나 cancel한다.
6. API는 append-only event를 저장한다.
7. Inventory, shopping list, Home briefing, recent item card가 다시 계산된다.

interpretation과 mutation은 분리되어 있다. parser나 model output이 inventory를
직접 수정하지는 않는다.

## Language Schema

MVP intent:

- `add_item`
- `set_low_threshold`
- `consume_item`
- `mark_low`
- `mark_out`
- `throw_away`
- `add_to_buy`
- `query_inventory`
- `needs_clarification`
- `unknown`

MVP slot:

- `item_name`
- `quantity`
- `low_threshold`
- `unit`
- `location`
- `expiration_date`

예시:

```json
{
  "intent": "add_item",
  "slots": {
    "item_name": "milk",
    "quantity": 2,
    "unit": "carton",
    "location": "fridge",
    "expiration_date": "2026-09-03"
  },
  "confidence": 0.94,
  "requires_confirmation": false
}
```

이후 intent에는 `remove_from_buy`, `query_expiring`, `correct_event` 등이 들어간다.

annotation record는 one-intent를 가정하지 않고 structured action list를 사용한다.

```json
{
  "actions": [
    {"intent": "add_to_buy", "entities": [{"label": "ITEM", "text": "milk"}]},
    {"intent": "throw_away", "entities": [{"label": "ITEM", "text": "spinach"}]}
  ]
}
```

### Generalized Item and Category Understanding

request는 product, alias, 혹은 더 넓은 category를 가리킬 수 있다. 예를 들어
`we're out of drink`는 문자 그대로 `drink`라는 inventory item이 있어야만
처리되어서는 안 된다. language layer는 user의 surface phrase를 추출하고,
versioned item taxonomy를 통해 그것을 resolve해야 한다.

```text
drink -> beverage
beverage -> water, milk, juice, soda, tea, coffee, ...
```

taxonomy는 singular/plural form, synonym, regional vocabulary, brand, category
hierarchy, household-specific alias를 지원해야 한다. 시스템은 original phrase,
resolved canonical entity 또는 category, candidate match, resolution confidence를
inference log에 남긴다.

category reference는 blind expansion이 아니라 context에 grounding되어야 한다.
`we're out of drinks`의 경우 시스템은 household의 known beverage inventory와
recent purchase를 확인한 뒤, relevant category action을 제안하거나
`Which drink—water, milk, or juice?` 같은 focused clarification을 해야 한다.
확인 없이 모든 beverage를 out으로 표시하거나 임의의 product를 추가해서는 안 된다.

## Expiry Model

expiry는 canonical item이 아니라 inventory batch에 속한다. 다른 날 산 milk 두
carton은 서로 다른 expiry date를 가질 수 있다.

MVP에서는 web date picker 또는 지원되는 text command 속 ISO date로 expiry를
입력할 수 있다. 시스템은 item type만 보고 expiry를 추론하지 않는다.

derived expiry state:

- `unknown`: expiry date 없음
- `fresh`: 3일 이상 남음
- `expiring_soon`: 0일에서 3일 남음
- `expired`: expiry date가 지남

date는 `YYYY-MM-DD`를 사용한다. timezone shift를 막기 위해 비교는 date-only UTC
value로 수행한다.

natural date handling은 hybrid 방식이다.

1. slot model이 `August twenty-eighth` 같은 raw date span을 추출한다.
2. deterministic date library가 `reference_date`와 `timezone`을 사용해 그 span을 normalize한다.
3. event를 저장하기 전에 사용자가 resulting ISO date를 확인한다.

model이 calendar date 자체를 계산해서는 안 된다.

## Event Model

event log가 source of truth다. 현재 view는 event에서 파생된 projection이다.

MVP event type:

- `item_added`
- `item_consumed`
- `item_marked_low`
- `item_thrown_away`
- `item_added_to_buy`
- `shopping_item_purchased`
- `shopping_item_restored`
- `shopping_item_deleted`
- `item_low_threshold_set`
- `item_adjusted`
- `item_removed`

event field:

- `id`
- `event_type`
- `item_name`
- `quantity`
- `unit`
- `location`
- `expiration_date`
- `raw_utterance`
- `confidence`
- `source`
- `created_at`

MVP 규모의 데이터에서는 read endpoint가 모든 event를 replay한다. event volume이
그만한 이유를 만들면 materialized projection을 추가할 수 있다.

shopping item은 planned purchase context로서 `quantity`, `unit`, `location`,
`expiration_date`를 재사용한다. context-aware `shopping_item_purchased` event는
reversible inventory batch 하나를 추가한다. `shopping_item_restored`는 그
purchase가 만든 batch만 제거하고, 구매 이전부터 있던 inventory는 보존한다.
quantity가 없던 legacy purchase event는 shopping history로만 남으며, 기존
inventory를 소급해서 바꾸지는 않는다.

## Architecture

```text
Next.js web app on Vercel
          |
          | HTTPS JSON
          v
Cloudflare Worker API
          |
          v
Cloudflare D1 event store
```

향후 voice path:

```text
Initial:
Raspberry Pi -> push-to-talk -> provider-neutral cloud ASR -> Worker API

Measured extensions:
Raspberry Pi -> optional wake word -> cloud ASR or local fallback -> Worker API
```

### Personalization Boundary

voice와 language personalization은 shared-base / personal-adapter architecture를 따른다.

```text
Shared base
  action and entity schemas
  general relevance / intent / slot behavior
  temporal grounding
  safety and confirmation policy

Personal adapter
  user/device/language profile
  dynamic inventory and shopping vocabulary
  reviewed pronunciation and ASR confusion evidence
  household aliases and category preferences
  optional user-specific model parameters
```

personal data가 shared model parameter, global alias, canonical taxonomy를
조용히 바꾸면 안 된다. shared data로 승격하려면 provenance, review, versioning,
user-disjoint evaluation이 필요하다. 이렇게 해야 personalized single-user MVP를
유지하면서도, 이후 추가 user에 대한 zero-shot / few-shot adaptation study를
막지 않을 수 있다.

### Web Responsibilities

- text command와 optional expiry date를 입력받는다
- interpretation과 confidence를 표시한다
- explicit confirmation을 요구한다
- inventory, shopping list, event history를 렌더한다
- loading, empty, validation, API error state를 제공한다
- action selection, exact span, controlled value, phrase family, dataset purpose,
  collection counter, queue-driven sample loading을 갖춘 전용 annotation-v2
  screen을 제공한다

### API Responsibilities

- request body를 검증한다
- 지원되는 English command pattern을 parse한다
- structured interpretation을 반환한다
- confirmed event를 저장한다
- inventory와 shopping-list projection을 만든다
- configured web origin에 대해 CORS를 강제한다
- action-group annotation을 검증하고 저장한다
- 민감하지 않은 aggregate count와 prioritized annotation queue를 노출한다

### Shared Contract Responsibilities

- intent, slot, event, response schema를 정의한다
- web과 API payload를 동기화한다
- malformed date, quantity, event type을 거부한다
- annotation action, controlled vocabulary, purpose-specific stat를 정의한다

## API Contract

- `POST /commands/interpret`: mutation 없이 parse
- `POST /events`: confirmed state-changing action 저장
- `GET /inventory`: current projected inventory 반환
- `GET /shopping-list`: projected shopping item 반환
- `POST /shopping-list/:item/add`: active item과 planned purchase context를
  추가하거나 교체
- `POST /shopping-list/:item/purchase`: item을 purchased로 표시하고 그 context를
  inventory batch로 추가
- `POST /shopping-list/:item/restore`: item을 restore하고 purchase-created
  inventory batch만 제거
- `POST /shopping-list/:item/delete`: inventory를 바꾸지 않고 active item을
  shopping queue에서 제거

purchase와 restore response는 저장된 event와 resulting inventory / shopping
projection을 함께 포함한다. web은 이 response를 직접 반영하므로, D1 write 직후
별도의 read에 의존하지 않아도 visible state가 즉시 바뀐다. client는
`?include=projections`로 이 응답을 요청하며, 해당 parameter가 없으면 rolling
deployment compatibility를 위해 legacy single-event response를 유지한다.
- `GET /events`: recent event history 반환
- `GET /health`: health check
- `POST /inferences/outcome`: reviewed non-event outcome 기록
- `POST /annotations`: reviewed action group 1~8개 저장
- `GET /annotations/stats`: aggregate training/evaluation candidate count 반환
- `GET /annotations/queue`: annotation용 prioritized unlabeled inference sample 반환

interpretation request는 date, conversation, activation context를 지원한다.

```json
{
  "text": "Add eggs expiring next Friday",
  "reference_date": "2026-08-26",
  "timezone": "America/New_York",
  "conversation_id": "75206db2-2907-4a09-98a7-1844f5be8fdb",
  "turn_index": 4,
  "speaker_role": "user",
  "activation_mode": "push_to_talk"
}
```

`turn_index`는 `conversation_id`가 있을 때만 허용된다. allowed activation mode는
`manual_text`, `push_to_talk`, `wake_word`, `always_listening`이다.
`wake_word`를 쓰는 경우 activation layer가 `text`를 보내기 전에 trigger를
제거해야 한다. wake phrase는 NLU feature가 아니다.

## Language Understanding Architecture

목표 language pipeline은 다음과 같다.

```text
English command
      |
      v
Intent classification
      |
      v
Slot span extraction
      |
      v
Date, quantity, unit, and item normalizers
      |
      v
Zod schema validation
      |
      v
User correction or confirmation
      |
      v
Append-only event
```

### Intent Model

TF-IDF baseline과 frozen human test set 이후에는 `distilbert-base-uncased`
sequence classification을 다음 intent에 대해 비교한다.

- `add_item`
- `consume_item`
- `mark_low`
- `mark_out`
- `throw_away`
- `add_to_buy`
- `query_inventory`
- `needs_clarification`
- `unknown`

첫 baseline은 single-intent로 유지한다. multi-action record는 지금 수집하고,
false first-intent label 없이 export하며, 이후 multi-label 또는
structured-prediction baseline을 위해 보류한다.

### Slot Model

BIO label을 사용하는 token classification을 쓴다.

- `B-ITEM`, `I-ITEM`
- `B-QUANTITY`, `I-QUANTITY`
- `B-UNIT`, `I-UNIT`
- `B-LOCATION`, `I-LOCATION`
- `B-EXPIRY_DATE`, `I-EXPIRY_DATE`

예:

```text
put             O
12              B-QUANTITY
eggs            B-ITEM
with            O
expiry          O
date            O
on              O
august          B-EXPIRY_DATE
twenty-eighth   I-EXPIRY_DATE
```

### Deterministic Normalizers

model은 span을 추출하고, normalizer는 이를 domain value로 바꾼다.

- `eggs` -> `egg`
- `twelve` -> `12`
- `cartons` -> `carton`
- `August twenty-eighth` -> `2026-08-28`

explicit reference date를 사용해 `chrono-node` 같은 date parser를 쓴다.
ambiguous result는 confirmation이 필요하다.

### Correction Data

proposed interpretation과 user-corrected interpretation을 모두 저장한다.
최소 training record는 다음 정보를 포함해야 한다.

```json
{
  "text": "put 12 eggs with expiry date on august twenty-eighth",
  "intent": "add_item",
  "entities": [
    {
      "label": "QUANTITY",
      "start": 4,
      "end": 6,
      "text": "12"
    },
    {
      "label": "ITEM",
      "start": 7,
      "end": 11,
      "text": "eggs"
    },
    {
      "label": "EXPIRY_DATE",
      "start": 32,
      "end": 52,
      "text": "august twenty-eighth"
    }
  ],
  "normalized": {
    "item_name": "egg",
    "quantity": 12,
    "expiration_date": "2026-08-28"
  }
}
```

raw span과 normalized value는 분리해서 유지해야 model error와 normalization error를
독립적으로 평가할 수 있다.

## Contextual Conversation Architecture

최종 시스템은 command처럼 생긴 문장만 받는 것이 아니라, ordinary dialogue 안에서
actionable request를 찾아야 한다. context는 모델에 transcript 전체를 무한정
붙여 넣는 것이 아니라, structured되고 permissioned되어야 한다.

```text
current turn + recent turns + confirmed household state + user constraints
                              |
                              v
              request detection and context retrieval
                              |
                              v
          intent, entities, goals, ambiguity, and action proposal
                              |
                              v
               clarification, confirmation, or recommendation
```

context source에는 recent conversational turn, inventory와 expiry, shopping list,
dietary restriction, preference, goal, budget, location, time이 포함된다. 각
prediction은 어떤 context record가 결과에 영향을 미쳤는지 log해야 재현과 audit가
가능하다.

시스템은 다음을 구분해야 한다.

- explicit state-changing request
- 충분히 grounding된 implicit request
- informational question
- recommendation request
- kitchen action이 없는 casual conversation
- clarification이 필요한 ambiguous request

## Recommendation Architecture

recommendation은 contextual understanding 위에 쌓이는 별도의 candidate-generation
및 ranking pipeline이다.

1. conversation을 goal과 hard constraint로 변환한다.
2. inventory, expiry, shopping list, preference, 명시적으로 연결된
   product/deal source에서 candidate를 retrieval한다.
3. allergen, dietary conflict, stale deal, unavailable item, budget violation을
   filter한다.
4. 남은 candidate를 rank하고, ranking evidence를 함께 붙인다.
5. list 변경이나 purchase 생성 전에는 confirmation을 요구한다.
6. impression, acceptance, dismissal, correction, downstream outcome을 log한다.

처음에는 audit 가능한 rule과 retrieval로 시작한다. 충분한 unbiased impression과
outcome data가 쌓인 뒤에야 learned ranking을 추가한다. clicked item만으로
학습하면 안 된다. position과 availability가 selection bias를 만들기 때문이다.

## Milestones

### M0: Repository Foundation

- npm workspace
- shared TypeScript configuration
- shared Zod contract
- setup 및 progress documentation

완료 기준: workspace가 install되고 shared contract를 resolve한다.

### M1: Text Command API

- Cloudflare Worker scaffold
- D1 event migration
- rule-based English parser
- API validation과 CORS
- parser와 projection test

완료 기준: `We are low on milk`가 parse, confirm, persist되고 read endpoint에서 보인다.

### M2: Mobile Web MVP

- command와 optional expiry input
- interpretation preview와 confirmation
- explicit completion state를 갖춘 guided bulk initial-fridge setup
- Home briefing과 horizontally swipeable recent-item card
- inventory와 shopping-list view
- loading, empty, error state

완료 기준: 전체 flow가 phone-sized viewport에서 동작하고 refresh 후에도 유지된다.

### M3: Cloud Deployment

- production D1
- Worker deployment
- Vercel deployment
- API URL과 allowed origin configuration

완료 기준: Vercel app이 Worker를 통해 read/write하고, 관련 없는 origin은 거부된다.

### M4: Correction and Normalization

- confirmation 전 editable interpretation field 추가
- original prediction과 user correction 저장
- natural English date-span normalization 추가
- quantity, unit, item alias normalizer 확장
- inventory event를 만들지 않는 parser failure 기록

완료 기준:

- 사용자가 intent, item, quantity, unit, location, expiry를 수정할 수 있다.
- original utterance, prediction, correction, parser version이 보존된다.
- `August twenty-eighth`, `next Friday`, `tomorrow`가 explicit reference date에
  맞춰 normalize된다.

### M5: Dataset Collection

- corrected utterance와 parser failure 저장
- versioned JSONL data 생성
- train, validation, test split 정의
- intent와 slot evaluation script 수립

dataset 목표:

- intent별 80~150개의 reviewed example
- 총 800~1,500개 utterance
- 최소 200개의 expiry-date example
- word order, unit, politeness, ASR-like error가 다른 command
- product alias, unseen brand, category-level phrase, singular/plural form,
  그리고 `drink`, `snack`, `greens`, `something sweet` 같은 ambiguous term
- random template copy가 아니라 phrasing family 기준의 train/validation/test split
- 초기 UI progress target: human training candidate 100–200개와 독립적인 human
  evaluation candidate 100+개
- multi-action utterance를 structured action group으로 보존

UI target은 M5 완료가 아니라 첫 checkpoint다. 그 이후 collection은 위의
per-intent 및 total coverage 목표로 확장된다. 첫 reviewed baseline 구성,
source policy, task export, entity coverage, freeze rule은
[TEXT_DATASET_DESIGN_V1_KO.md](../ml/TEXT_DATASET_DESIGN_V1_KO.md)에 정의되어 있다.

완료 기준: 모든 supported intent에 reviewed example이 있고, test set에는 training에
없던 phrasing pattern이 포함된다.

현재 상태: infrastructure와 production UI는 완료되었고, human-reviewed
collection이 현재의 active work다. `synthetic-v1`은 800개 bootstrap record를
제공하지만 human evaluation requirement를 충족하지는 않는다. queue-based
sample loading과 task-aware train/evaluation export는 구현되었다. explicit
natural-date normalization도 expiry phrase에 대해 구현되었고,
reference-date/timezone persistence도 inference log와 reviewed export 전반에
적용되어 있다. annotation surface visibility와 더 강한 normalization rule은
아직 남아 있다.

### M5.5: Experiment and Observability Foundation

- unknown, cancelled, rejected를 포함해 모든 interpretation attempt log
- model, parser, normalizer, schema, dataset, context snapshot versioning
- immutable run metadata, artifact hash, seed, split manifest 추가
- aggregate, slice, calibration, latency metric을 위한 comparison dashboard 구축
- privacy retention, deletion, redaction, training-export policy 정의

완료 기준: production prediction과 reported experiment 각각을 code, model, data,
configuration, context, user outcome까지 추적할 수 있다.

### M6: English NLP Model

- `distilbert-base-uncased` intent classification fine-tuning
- slot span을 위한 token classification fine-tuning
- normalization을 span extraction과 별도로 평가
- model 및 hybrid output을 deterministic baseline과 비교
- confidence threshold, `unknown` fallback, confirmation policy 추가

완료 기준: intent macro-F1, entity-level slot F1, end-to-end exact match가
보고되고 baseline보다 향상된다.

### M7: Model Deployment

- compact model을 ONNX로 export
- Raspberry Pi에서 latency와 memory benchmark
- Cloudflare는 schema validation과 event persistence 담당 유지
- 모든 prediction에 model/version, normalizer version 기록
- deterministic fallback behavior 보존

완료 기준: deployed pipeline이 confirmation을 우회하지 않으면서 accuracy target을 충족한다.

### M8: Raspberry Pi Voice Client

- wake-word 이전 단계의 push-to-talk audio capture
- provider-neutral cloud ASR baseline
- optional local ASR fallback
- Korean-English language hint와 dynamic household vocabulary
- 별도로 versioned된 shared base와 personal adapter context
- Worker API client
- confirmation feedback

완료 기준: voice input이 web text input과 동일한 confirmed event path를 따르고,
personalized context가 shared truth를 바꾸거나 confirmation을 우회하지 않으면서
frozen personal evaluation set을 개선한다.

### M9: Contextual Conversation Understanding

- multi-turn everyday conversation 안에서 kitchen request 감지
- turn 간 reference와 entity 해소
- 관련 있고 허용된 household/user context만 retrieval
- goal, preference, dietary constraint, budget, uncertainty 표현
- alias, brand, hierarchical category, household vocabulary를 포함한
  versioned item/category taxonomy를 통해 product mention 해소
- context만으로 안전한 action을 식별할 수 없으면 category-level request를 clarify
- clarification behavior와 context-specific evaluation set 추가

완료 기준: unseen conversation, distractor turn, stale state가 포함된 frozen test에서
contextual exact match와 request-detection target을 충족한다.

### M10: Recommendation and Deal Ranking

- grounded context로부터 meal, product, substitution candidate 생성
- constraint filtering과 explainable ranking 추가
- freshness와 provenance metadata가 있는 deal source 하나 통합
- offline ranking benchmark와 unbiased impression logging 수립
- rollback과 safety monitoring이 있는 guarded online evaluation 수행

완료 기준: recommendation이 dietary safety, deal freshness, privacy, user control을
악화시키지 않으면서 rules baseline 대비 user outcome을 개선한다.

## Testing Strategy

- command pattern, normalization, quantity, expiry에 대한 unit test
- event projection unit test
- local D1 기반 API test
- web interaction test
- manual mobile viewport check
- interpretation, confirmation, persistence, refresh의 end-to-end test
- frozen offline language / recommendation benchmark
- context, ambiguity, ASR-noise, unseen-entity, safety slice
- model version별 calibration, latency, drift, leakage, rollback test

## Initial Success Metrics

- reviewed MVP test set에서 최소 90% intent accuracy
- 최소 90% entity-level slot F1
- date span이 맞을 때 최소 95% date-normalization accuracy
- 최소 85% end-to-end action exact match
- unconfirmed state-changing action 0건
- typical command를 5초 이내에 confirm 가능
- 잘못된 action이 event history에서 식별 가능
- 모든 inference attempt의 100%가 parser/model, normalizer, schema, context version을 지님
- 모든 training run의 100%가 immutable dataset split, commit, seed, artifact hash를 지님
- contextual request detection과 exact-match result를 single-turn command result와 별도로 보고
- exact product, alias, unseen brand, category-level reference에 대한
  entity-resolution accuracy를 별도로 보고
- recommendation release는 Recall@K, NDCG@K, constraint violation, coverage,
  deal freshness, online accept/dismiss outcome을 보고

## Known Risks

### Inventory Drift

사용자가 action logging을 잊을 수 있다. MVP는 physical inventory의 완벽한 정확성을
주장하기보다 coarse state와 visible history를 사용한다.

### Command Ambiguity

`Add milk`는 inventory를 뜻할 수도, shopping list를 뜻할 수도 있다. parser는
supported pattern에 대해서만 intent를 고르고, 그렇지 않으면 `unknown`을 반환한다.

category phrase는 또 다른 ambiguity를 만든다. `we're out of drink`는 특정
preferred beverage를 뜻할 수도 있고, 모든 beverage를 뜻할 수도 있고,
recommendation request일 수도 있다. category resolution은 known household context와
confidence threshold를 사용하며, low confidence면 broad state change 대신
clarification을 수행한다.

### Batch Expiry Complexity

여러 batch는 서로 다른 expiry date를 가질 수 있다. MVP는 addition event에 expiry를
보존하고, 가장 가까운 known expiry를 보여 준다.

### Premature Model Training

template-generated data는 misleading result를 만들 수 있다. training은 product flow가
reviewed real-world utterance를 만들기 시작한 후에야 본격적으로 시작한다.

### Date Ambiguity

year가 없는 표현은 reference date와 timezone에 의존한다. 시스템은 resolved date를
confirmation용으로 보여 주어야 하며, 여러 해석이 가능한 경우 조용히 추측해서는
안 된다.

### Model Deployment Constraints

Cloudflare Worker code가 arbitrary custom-model hosting이 가능하다고 가정해서는
안 된다. 장기적으로는 Raspberry Pi의 ONNX inference 또는 dedicated inference
service가 더 적절하며, Worker는 validation과 persistence 책임을 유지해야 한다.
