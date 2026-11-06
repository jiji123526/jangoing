# Classic Alexa 기반 선형 NLU 파이프라인 아키텍처 결정

## 문서 목적

이 문서는 Jangoing의 현재 텍스트 중심 구조를 Classic Alexa의
“Life of an Utterance” 방식과 비교하고, 이를 바탕으로 Jangoing의 런타임
언어 계층을 어떻게 확장할지 결정한다.

이 문서는 단순한 음성 기능 계획이 아니다. 음성이 추가되기 전의 텍스트
NLU 구조, relevance 판정, entity resolution, 확인/교정, 다중 턴 문맥,
평가 로깅까지 포함하는 런타임 아키텍처 결정이다.

첨부된 Classic Alexa 구조에서 가져오는 핵심 원칙은 다음과 같다.

```text
하나의 요청
-> 단계가 명확히 분리된 선형 처리
-> 각 단계의 독립적인 입력과 출력
-> 단계별 정확도와 지연시간 측정
-> 최종 실행 전 사용자 확인
```

Jangoing에는 Classic Alexa와 다른 두 가지 조건이 있다.

1. Alexa는 wake word가 요청의 시작을 알려주지만, Jangoing은 일반 대화
   안에서 주방과 관련된 발화를 먼저 찾아야 한다.
2. Alexa의 entity resolution은 대규모 공용 authority source를 중심으로
   하지만, Jangoing은 공용 기본 catalog와 household별 personal adapter를
   함께 사용해야 한다.

따라서 최종 결정은 다음과 같다.

> Jangoing은 하나의 `Kitchen` domain을 중심으로 relevance, NLU, 정규화,
> entity resolution, routing, action proposal, confirmation을 선형으로
> 처리한다. ASR은 나중에 같은 텍스트 파이프라인 앞에 삽입한다. 모든
> state-changing action은 확인 전까지 household state를 변경하지 않는다.

---

## 1. 적용 범위와 적용하지 않는 것

### 1.1 이 결정이 다루는 범위

- 일반 대화에서의 relevance 판정
- intent와 entity span 추출
- quantity, unit, item, date의 결정적 normalization
- 공용 catalog와 household별 entity resolution
- 여러 후보 중 실행 후보를 선택하는 routing
- action proposal과 사용자 확인
- 교정 데이터를 이용한 제한적 자동 개선
- conversation context와 향후 Dialog State Tracking
- 단계별 평가와 운영 로깅
- 향후 Raspberry Pi 음성 입력과 TTS 연결 지점

### 1.2 이 결정이 당장 해결하지 않는 것

- wake word의 acoustic model 구현
- 고품질 ASR 또는 TTS model 학습
- 완전한 end-to-end 대화형 LLM
- 자동 확인 없는 inventory mutation
- household alias를 전역 catalog truth로 승격하는 정책
- 추천, 가격, deal ranking의 전체 구조
- 한국어 NLU를 한 번에 완성하는 것

Jangoing의 기존 문서가 정한 순서대로, 먼저 영어 텍스트 pipeline을
측정 가능하게 만든 뒤 ASR과 한국어-영어 code-switching을 추가한다.

---

## 2. 현재 Jangoing 구조

### 2.1 현재 런타임 흐름

현재의 주요 흐름은 다음과 같다.

```text
Next.js Web
  |
  | POST /commands/interpret
  v
Cloudflare Worker / local Node API
  |
  | resolve temporal grounding
  | parseCommand()
  | persist pending inference
  v
Web interpretation editor
  |
  | confirm / edit / cancel
  v
POST /events 또는 POST /events/batch
  |
  | append-only event
  | correction record
  | inference outcome
  v
Inventory / shopping projections
```

구현상 주요 위치는 다음과 같다.

| 역할 | 현재 위치 |
|---|---|
| 공유 계약과 Zod schema | `packages/contracts/src/index.ts` |
| 규칙 기반 parser | `apps/api/src/nlp/parse-command.ts` |
| temporal grounding | `apps/api/src/nlp/temporal-grounding.ts` |
| 해석 API와 이벤트 API | `apps/api/src/index.ts` |
| event 기반 projection | `apps/api/src/domain/projections.ts` |
| 확인/교정 UI | `apps/web/app/page.tsx` |
| API client | `apps/web/lib/api.ts` |
| inference log | `apps/api/migrations/0003_create_inference_logs.sql` |
| correction log | `apps/api/migrations/0002_create_corrections.sql` |
| annotation relevance | `apps/api/migrations/0008_add_annotation_relevance.sql` |
| household ownership | `apps/api/migrations/0012_add_household_ownership.sql` |
| catalog 후보 설계 | `docs/ENG/ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md` |

### 2.2 현재 이미 잘 맞는 부분

현재 구조는 Classic Alexa식 선형 아키텍처로 발전하기에 좋은 기반을
가지고 있다.

#### 해석과 mutation이 분리되어 있다

`POST /commands/interpret`는 prediction을 만들지만 inventory event를
생성하지 않는다. 실제 state 변경은 확인된 event를 저장할 때만 발생한다.

이는 Classic Alexa의 upstream interpretation과 fulfillment를 분리하는
구조에 대응하며, Jangoing의 안전 요구사항에도 맞는다.

#### inference와 correction이 분리되어 있다

`inference_logs`는 prediction, context, version, latency, outcome을
기록하고, `corrections`는 prediction과 최종 확인 결과를 별도로 저장한다.

따라서 사용자의 교정은 다음 세 가지로 재사용할 수 있다.

```text
운영 품질 분석
-> annotation 후보
-> 향후 모델 학습 및 개인 adapter
```

#### temporal grounding이 이미 독립되어 있다

상대 날짜의 의미를 annotation 시점이 아니라 원래 발화 시점의
`reference_date`와 `timezone`으로 결정한다. 이는 normalization stage를
다른 NLU 단계와 분리하기에 적합하다.

#### multi-action 구조가 이미 존재한다

현재 계약과 annotation은 하나의 발화에 여러 action을 담을 수 있다.
Classic Alexa의 “one intent per utterance”를 그대로 적용하지 않고,
Jangoing에서는 다음처럼 해석한다.

```text
하나의 utterance
-> 하나의 Kitchen domain
-> 하나 이상의 action group
-> 각 action group은 하나의 intent와 entity 집합을 가짐
```

기존의 top-level `intent`와 `slots`는 backward compatibility를 위해
유지하되, multi-action의 정식 표현은 `actions`가 된다.

### 2.3 현재 구조와 새 구조의 차이

| 영역 | 현재 Jangoing | Classic Alexa 기반 목표 |
|---|---|---|
| Invocation | typed text 또는 activation metadata | 나중에 Pi의 push-to-talk/wake word가 앞단 담당 |
| Relevance | annotation에서만 네 가지 class를 저장 | runtime 첫 단계에서 분류 |
| NLU | `parseCommand()`에 규칙과 일부 normalization이 결합 | intent와 raw entity span을 별도 stage로 반환 |
| FLARE | correction을 저장하지만 runtime 재사용 없음 | 검토된 반복 오류만 pre-NLU rewrite 후보로 사용 |
| Entity resolution | 현재 inventory/shopping 이름에 대한 singular/plural matching | 공용 catalog + household personal adapter + 후보 ranking |
| Routing | 사실상 parser의 단일 결과를 사용 | 후보, confidence, context를 이용해 fulfillment 후보 선택 |
| Action layer | event 저장과 projection이 구현됨 | proposal/speechlet 경계를 명시적으로 분리 |
| Confirmation | Web에서 편집 후 `/events`에 저장 | 모든 state-changing proposal의 공통 confirmation stage |
| Context | `conversation_id`, `turn_index`를 기록 | prior turn과 pending clarification을 실제로 읽는 DST |
| Evaluation | total latency와 최종 prediction 중심 | stage별 latency, fallback, 후보, resolution, outcome 측정 |
| ASR | 아직 없음 | 동일 텍스트 pipeline 앞에 provider-neutral adapter로 추가 |
| TTS | 아직 없음 | confirmation과 결과 응답의 후단 adapter로 추가 |

---

## 3. 목표 아키텍처

### 3.1 텍스트 단계의 목표 흐름

```text
현재 입력
  |
  v
Input / Activation
  |  typed text, push-to-talk transcript, wake-word-stripped text
  v
Relevance Gate
  |  actionable / contextual_preference /
  |  domain_non_actionable / unrelated
  v
FLARE-style Rewrite
  |  선택적 household-scoped correction rewrite
  v
Kitchen NLU
  |  domain=Kitchen
  |  action intent + raw entity spans
  v
Deterministic Normalization
  |  quantity, unit, date, surface normalization
  v
Entity Resolution
  |  shared base catalog + household personal adapter
  v
Dynamic Routing
  |  fulfillment candidate 또는 clarification
  v
Action Proposal
  |  validated, reviewable, non-mutating
  v
Confirmation / Correction
  |  user confirms, edits, cancels, or rejects
  v
Speechlet-like Action Layer
  |  event append + projection update
  v
Response
  |  text now; TTS later
```

첨부 문서의 개요에는 NLU 뒤에 FLARE가 표시되지만, “NLU가 보기 전에
frictional utterance를 rewrite한다”는 설명과 실제 목적을 고려하면
Jangoing에서는 FLARE를 NLU 앞의 선택적 pre-processing stage로 둔다.
단, rewrite 전의 원본 utterance와 rewrite 결과를 모두 기록해야 한다.

### 3.2 선형 처리와 clarification의 관계

“선형”이라는 말은 모든 입력을 무조건 실행한다는 뜻이 아니다.
각 단계에서 다음 중 하나를 반환하고 다음 stage로 한 번만 진행한다.

```text
proceed
-> 다음 stage로 진행

abstain
-> clarification 또는 non-actionable 결과로 종료

reject
-> 안전 정책에 따라 실행하지 않고 로그만 남김
```

예를 들어 entity resolution에서 `milk`가 `whole_milk`와 `oat_milk`
모두에 매칭되면 이전 단계로 돌아가지 않는다. resolution stage가
`ambiguous` 결과를 만들고 routing stage가 clarification proposal을
선택한다.

### 3.3 단일 domain 정책

현재 runtime의 domain은 하나뿐이므로 `Kitchen`을 명시적 routing
boundary로 사용한다.

```text
domain = Kitchen
```

향후 shopping, recommendation, household assistant가 별도 domain으로
분리될 수는 있지만, 초기에는 여러 domain을 인위적으로 추가하지 않는다.
단일 domain은 schema, 평가, 안전 정책을 안정화하기 위한 의도적인
제약이다.

---

## 4. 각 stage의 책임과 계약

### 4.1 Input / Activation stage

#### 책임

- 입력 modality와 activation mode 기록
- wake word가 있으면 downstream text에서 제거
- typed text와 ASR transcript를 동일한 NLU 입력 형태로 변환
- 현재 request의 `conversation_id`, `turn_index`, `speaker_role` 연결

#### 현재 상태

계약에는 `activation_mode`가 이미 있다.

```text
manual_text
push_to_talk
wake_word
always_listening
```

그러나 현재 interpret logging은 source를 사실상 Web으로 기록한다.
voice가 추가되기 전에 input source와 ASR metadata를 명시적으로 분리해야
한다.

#### 목표 output

```json
{
  "raw_input": "Hey Jango, add two cartons of milk",
  "downstream_text": "add two cartons of milk",
  "source": "voice",
  "activation_mode": "wake_word",
  "conversation_id": "...",
  "turn_index": 4
}
```

`raw_input`은 debug/privacy 정책에 따라 보존 여부를 결정하고,
downstream NLU는 wake phrase가 제거된 text만 사용한다.

### 4.2 Relevance Gate

#### 책임

일반 대화 안에 있는 발화가 Jangoing의 action pipeline에 들어가야 하는지
판정한다.

기존 annotation의 네 가지 class를 그대로 사용한다.

```text
actionable
contextual_preference
domain_non_actionable
unrelated
```

#### 중요한 구분

`unknown` intent와 relevance class는 서로 다르다.

```text
I prefer oat milk.
-> contextual_preference
-> action 없음

Find the cheapest oat milk.
-> actionable
-> unknown 또는 향후 recommendation intent

The train was late.
-> unrelated
-> action 없음
```

#### 초기 구현

처음에는 deterministic rule 또는 TF-IDF classifier로 시작한다.

```text
relevance-rules-v1
-> known actionable pattern이면 actionable
-> 명시적 preference/domain negative pattern이면 해당 class
-> 불확실하면 low-confidence actionable 후보로 NLU에 전달하거나
   needs_clarification으로 종료
```

relevance가 `actionable`이 아닌 경우에는 inventory event를 생성하지 않는다.
다만 학습과 분석을 위해 inference log에는 저장한다.

#### 필요한 계약 확장

최종 `Interpretation`에는 다음 정보가 필요하다.

```json
{
  "relevance": "actionable",
  "relevance_confidence": 0.93,
  "relevance_version": "rules-v1"
}
```

non-actionable prediction을 사용자의 명시적 거부와 구분하기 위해,
장기적으로 inference outcome에 `not_actionable` 또는 별도 classifier
status를 추가한다. 기존 `rejected`를 재사용하면 모델의 relevance 거부와
사용자의 proposal 거부가 섞인다.

### 4.3 FLARE-style correction rewrite

#### 책임

과거의 반복된 correction을 사용해 NLU가 자주 실패하는 surface form을
개선한다.

예시:

```text
관찰된 surface: "two milk cartons"
반복된 최종 해석: quantity=2, unit=carton, item=milk
rewrite/feature: parser 또는 NLU에 해당 구조를 우선 후보로 제공
```

#### 안전 원칙

- 한 번의 교정만으로 자동 rewrite하지 않는다.
- human-reviewed correction만 사용한다.
- household별 correction을 전역 alias로 승격하지 않는다.
- 원문, rewrite 결과, 적용된 rule/version을 모두 기록한다.
- rewrite 결과가 불확실하면 원문을 유지한다.

#### 초기 구현

처음부터 자유로운 문장 rewrite model을 만들지 않는다. 다음처럼 제한된
correction rule로 시작한다.

```text
surface pattern
-> canonical item/unit/action hint
```

나중에 correction count, acceptance rate, repeated override rate를 기준으로
자동 적용 여부를 결정한다.

### 4.4 Kitchen NLU

#### 책임

Jangoing의 single `Kitchen` domain 안에서 action intent와 raw entity span을
추출한다.

현재 parser가 반환하는 구조는 유지하되, 내부적으로는 다음처럼 명확히
분리한다.

```text
NLU output
  intent: add_item
  raw_entities:
    ITEM: "milk"
    QUANTITY: "two"
    UNIT: "cartons"
```

NLU는 canonical item ID나 ISO date를 직접 결정하지 않는다. 그 책임은
뒤의 normalization과 entity resolution에 있다.

#### 현재 코드와의 연결

현재 `apps/api/src/nlp/parse-command.ts`는 다음을 한 함수 흐름 안에서
수행한다.

- sentence pattern matching
- item phrase extraction
- quantity/unit parsing
- 일부 alias normalization
- expiry normalization 연결
- confidence와 confirmation flag 생성

첫 리팩터링에서는 외부 API를 깨지 않도록 `parseCommand()`를 유지하고,
내부 helper 또는 새 `nlp/nlu.ts`에서 raw extraction과 normalization을
분리한다.

#### multi-action 정책

Classic Alexa의 one-intent-per-utterance를 Jangoing에 그대로 적용하지
않는다.

```text
utterance
-> 하나의 domain
-> 여러 action group 가능
-> action group마다 하나의 intent와 entity 연결
```

첫 모델 baseline이 single-action인 것은 데이터/평가 제약이지 runtime
계약을 single-action으로 되돌린다는 뜻이 아니다.

### 4.5 Deterministic Normalization

#### 책임

raw span을 canonical value로 변환한다.

| 입력 | normalization |
|---|---|
| `eggs` | `egg` |
| `two` | `2` |
| `cartons` | `carton` |
| `next Friday` | 원래 `reference_date`와 timezone에 따른 ISO date |
| `fridge` | `fridge` |

#### 정책

- quantity, unit, date는 가능한 한 결정적 code로 처리한다.
- model이 상대 날짜의 최종 calendar date를 직접 계산하지 않는다.
- normalization 실패와 span 추출 실패를 별도 오류로 기록한다.
- 원문 span과 canonical value를 함께 저장한다.

현재의 `temporal-grounding.ts`는 이 stage의 기반으로 유지한다.

### 4.6 Entity Resolution

#### 책임

정규화된 값을 실제로 실행 가능한 household entity와 연결한다.

Classic Alexa의 authority source에 대응하는 Jangoing 구조는 다음과 같다.

```text
공용 Base Catalog
  - canonical item/category
  - 공용 alias
  - brand/product relation
  - unit/category relation

Household Personal Adapter
  - household alias
  - 현재 inventory/shopping item
  - 반복된 correction
  - household category preference
  - 개인 ASR confusion pair
```

#### 현재 상태

현재는 `resolveExistingItemName()`이 inventory와 shopping list에 있는
이름을 대상으로 간단한 singular/plural matching을 수행한다.
이는 personal adapter의 아주 초기 버전으로 볼 수 있지만, 아직 다음이
없다.

- canonical entity ID
- 공용 catalog table
- household alias provenance
- 후보 목록과 resolution confidence
- category-level resolution
- ambiguous candidate policy

#### 단계적 구현

1. 기존 string 기반 event/projection을 유지한다.
2. canonical key와 display name을 분리한다.
3. base taxonomy에서 exact alias resolver를 만든다.
4. household alias 테이블을 추가한다.
5. 후보가 여러 개면 clarification으로 routing한다.
6. 충분한 데이터가 쌓인 뒤 fuzzy/vector retrieval을 검토한다.

초기에는 event의 `item_name`을 즉시 ID로 교체하지 않는다. event replay와
기존 데이터의 호환성을 유지하면서 `resolved_entity` metadata를 먼저
추가한다.

### 4.7 Dynamic Routing

#### 책임

앞 단계의 결과를 바탕으로 어떤 fulfillment 결과를 선택할지 결정한다.

초기 routing 후보는 다음과 같다.

```text
confirmed_action_proposal
clarification_proposal
non_actionable_result
unsupported_request
safe_rejection
```

#### 초기 정책

현재는 parser가 사실상 하나의 결과만 만들기 때문에 routing을 별도
service로 과도하게 만들지 않는다.

```text
후보 1개 + 필수 slot 충족
-> action proposal

후보 여러 개
-> clarification

confidence 낮음
-> review 또는 clarification

지원하지 않는 명확한 요청
-> unknown proposal, mutation 없음
```

향후 learned NLU가 n-best 후보를 반환할 때 confidence, household context,
previous turn, correction history를 사용해 후보를 ranking한다.

Routing은 inventory event를 직접 생성하지 않는다.

### 4.8 Action Proposal / Speechlet-like action layer

Classic Alexa의 Speechlet에 대응하는 Jangoing의 역할은 다음처럼 나눈다.

```text
Action Proposal
  - 구조화된 해석
  - entity resolution 결과
  - confirmation 필요 여부
  - 사용자에게 보여줄 설명

Action Executor
  - 확인된 proposal 검증
  - event append
  - projection 갱신
  - 결과 응답 생성
```

현재 `/commands/interpret`와 `/events`가 이 경계를 이미 부분적으로
구현하고 있다. 다만 최종 proposal의 source of truth를 browser payload가
아니라 서버의 pending inference record로 만들 필요가 있다.

확인 요청에서 browser가 `original_interpretation`을 다시 보내더라도,
서버는 `inference_logs.predicted_interpretation`을 기준으로 원래 prediction을
확인해야 한다. browser payload는 사용자의 수정 결과로만 취급한다.

### 4.9 Confirmation / Correction

모든 state-changing action은 confidence가 높아도 확인한다.

```text
prediction
-> user review
-> confirm
-> corrected result 또는 cancel
-> event 또는 non-event outcome
```

현재 Web UI의 편집 및 `/events`, `/events/batch` 흐름은 이 stage의
기능을 이미 상당 부분 충족한다.

향후 voice에서도 같은 정책을 사용한다.

```text
Pi 음성 입력
-> 텍스트 proposal
-> spoken confirmation
-> 사용자가 수정하거나 확인
-> 같은 event API
```

### 4.10 Conversation Context / DST

현재 `conversation_id`, `turn_index`, `speaker_role`은 request context에
저장되지만 이전 turn을 실제로 해석하지 않는다.

향후 DST가 관리할 최소 상태는 다음과 같다.

```json
{
  "conversation_id": "...",
  "active_referents": [
    {
      "surface": "it",
      "resolved_to": "oat_milk",
      "evidence_turn_index": 3
    }
  ],
  "pending_clarification": {
    "field": "item_name",
    "candidates": ["whole_milk", "oat_milk"]
  },
  "last_proposal_id": "...",
  "expires_at": "..."
}
```

예시:

```text
User: We bought oat milk yesterday.
Jangoing: Got it.
User: Put it in the fridge.
```

두 번째 발화는 `it`을 이전 turn의 `oat milk`로 resolve해야 한다.
확신이 없으면 location action을 생성하지 않고 clarification을 반환한다.

Context state는 household와 conversation에 scope를 두고, 만료와 privacy
정책을 가져야 한다. 오래된 context나 다른 household의 context를 사용해서는
안 된다.

---

## 5. 데이터 모델과 계약 변경 계획

### 5.1 기존 계약을 깨지 않는 원칙

기존 `Interpretation`의 다음 필드는 당장 제거하지 않는다.

```text
intent
slots
confidence
requires_confirmation
raw_utterance
actions
```

새 구조는 additive change로 시작한다.

```json
{
  "domain": "Kitchen",
  "relevance": "actionable",
  "relevance_confidence": 0.94,
  "intent": "add_item",
  "slots": {},
  "actions": [],
  "resolution": {},
  "routing": {},
  "pipeline": {
    "relevance_version": "rules-v1",
    "nlu_version": "rules-v3",
    "normalizer_version": "normalizers-v1",
    "resolver_version": "resolver-v1",
    "router_version": "router-v1"
  }
}
```

초기에는 새 필드를 optional로 두어 기존 Web과 annotation client가
순차적으로 배포될 수 있게 한다. schema가 안정되면 production prediction의
필수 필드로 승격한다.

### 5.2 inference logging

기존 `inference_logs`에 있는 total latency와 prediction은 유지한다.
추가로 다음 정보를 `request_context` 또는 별도 stage log에 저장한다.

- relevance 결과와 confidence
- stage별 version
- stage별 latency
- rewrite 적용 여부
- entity resolution 후보와 선택 결과
- routing decision
- fallback 또는 validation error
- context source와 evidence turn
- modality와 ASR metadata

개인 대화 원문을 stage log에 중복 저장하지 않는다. 원문은 inference
record에 보관하고, stage log에는 필요한 구조화 결과와 hash/reference를
저장하는 것을 우선한다.

### 5.3 제안 migration

구현 순서는 다음과 같다.

#### Migration A: inference stage metadata

선택지는 두 가지다.

```text
단기: request_context JSON 확장
장기: inference_stage_logs 테이블 추가
```

단기에는 JSON 확장이 빠르지만 query와 분석이 어렵다. stage별 운영
대시보드가 필요해지는 시점에는 다음과 같은 별도 테이블을 추가한다.

```sql
inference_stage_logs (
  id TEXT PRIMARY KEY,
  inference_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL
)
```

#### Migration B: household entity adapter

최소 구조는 다음과 같다.

```sql
household_entity_aliases (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  normalized_surface TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

`source`는 최소한 다음을 구분해야 한다.

```text
manual
confirmed_correction
inventory_observed
asr_correction
imported_candidate
```

#### Migration C: conversation state

실제 DST를 시작할 때 household-scoped conversation state를 추가한다.

```sql
conversation_states (
  conversation_id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  last_turn_index INTEGER NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

초기에는 모든 conversation을 영구 보관하지 않고 TTL과 삭제 정책을
적용한다.

### 5.4 canonical entity ID 도입 순서

현재 event projection은 `item_name` string을 key로 사용한다. 따라서 다음
순서로 변경한다.

1. canonical key 생성 함수를 추가한다.
2. 기존 `item_name`을 display/surface 값으로 유지한다.
3. prediction과 resolution metadata에 canonical key를 추가한다.
4. catalog와 household alias를 대상으로 resolver를 검증한다.
5. projection이 canonical key를 사용할 필요가 생길 때 별도 migration을
   설계한다.

처음부터 event primary behavior를 ID 중심으로 바꾸면 기존 event replay,
shopping list, media key, annotation export가 동시에 영향을 받는다.

---

## 6. 구현 단계

### Phase 0: 문서와 contract 고정

- [ ] `Kitchen` domain과 기존 intent 목록을 공식화한다.
- [ ] relevance 네 가지 class와 `unknown`의 의미를 분리한다.
- [ ] multi-action에서 action별 intent 정책을 고정한다.
- [ ] `Interpretation` additive fields를 설계한다.
- [ ] stage 이름과 version 규칙을 고정한다.
- [ ] stage별 error code 목록을 만든다.

완료 조건:

- Web, API, annotation export가 같은 구조화 vocabulary를 사용한다.
- 기존 payload를 읽는 client가 깨지지 않는다.
- 새로운 prediction에 어느 stage가 어떤 결과를 만들었는지 추적할 수
  있다.

### Phase 1: Runtime relevance gate

- [ ] `apps/api/src/nlp/relevance.ts`를 추가한다.
- [ ] 기존 annotation relevance convention을 runtime output에 연결한다.
- [ ] actionable과 non-actionable을 inference log에 함께 기록한다.
- [ ] non-actionable과 user-rejected outcome을 구분한다.
- [ ] low-confidence relevance policy를 결정한다.
- [ ] relevance classifier의 독립 test set을 만든다.

권장 initial behavior:

```text
high-confidence non-actionable
-> no action proposal
-> no event
-> inference outcome = not_actionable

high-confidence actionable
-> NLU 진행

low-confidence
-> NLU 후보 생성 후 clarification 또는 review
```

완료 조건:

- preference와 domain-related non-actionable이 inventory event를 만들지 않는다.
- grocery vocabulary가 있다는 이유만으로 actionable이 되지 않는다.
- relevance metric을 intent metric과 별도로 계산할 수 있다.

### Phase 2: Linear pipeline orchestrator

- [ ] `apps/api/src/nlp/pipeline.ts`를 추가한다.
- [ ] `handleInterpret()`이 직접 `parseCommand()`를 호출하지 않고
  orchestrator를 호출하게 한다.
- [ ] 각 stage의 input/output과 latency를 기록한다.
- [ ] 외부 API response는 기존 구조와 호환한다.
- [ ] parser fallback을 명시적인 pipeline status로 반환한다.

권장 내부 interface:

```ts
interface PipelineInput {
  text: string;
  requestContext: TemporalAndConversationContext;
  householdContext: HouseholdContext;
}

interface PipelineResult {
  relevance: RelevanceResult;
  interpretation?: Interpretation;
  resolution?: ResolutionResult;
  routing: RoutingResult;
  proposal?: ActionProposal;
  stages: StageTrace[];
}
```

완료 조건:

- 모든 request가 동일한 stage 순서를 사용한다.
- stage 하나의 실패가 다른 stage의 실패로 뭉뚱그려지지 않는다.
- pending inference가 최종 proposal과 연결된다.

### Phase 3: NLU와 normalization 분리

- [ ] 현재 parser에서 raw extraction helper를 분리한다.
- [ ] entity span과 canonical value를 별도 구조로 표현한다.
- [ ] quantity/unit/date normalization을 독립 test한다.
- [ ] `ITEM_CONDITION` 등 annotation-only label의 runtime 사용 여부를
  별도로 결정한다.
- [ ] multi-action action-to-entity 연결을 보존한다.

완료 조건:

- span 오류와 normalization 오류를 별도로 집계할 수 있다.
- `next Friday` 같은 값은 항상 원래 temporal context로 계산된다.
- unsupported request가 unrelated로 잘못 분류되지 않는다.

### Phase 4: Entity resolution v1

- [ ] `ml/taxonomy/grocery-v1.json`을 base catalog 입력으로 연결한다.
- [ ] exact alias resolver를 만든다.
- [ ] 현재 inventory/shopping 이름을 household candidate로 사용한다.
- [ ] `household_entity_aliases` migration을 추가한다.
- [ ] singular/plural resolver를 새 resolver의 adapter로 이동한다.
- [ ] 후보가 여러 개인 경우 ambiguity 결과를 만든다.
- [ ] canonical key, surface, display name을 분리한다.

완료 조건:

- `milk`, `eggs`, household alias가 예측 가능하게 resolve된다.
- 다른 household의 alias가 검색되지 않는다.
- ambiguity가 자동 mutation으로 이어지지 않는다.
- resolution source와 confidence가 로그에 남는다.

### Phase 5: FLARE-style correction layer

- [ ] correction history에서 반복 오류를 집계한다.
- [ ] reviewed correction만 candidate rule로 만든다.
- [ ] household scope를 적용한다.
- [ ] rewrite 전/후와 적용 version을 기록한다.
- [ ] shadow mode에서 acceptance/correction rate를 측정한다.
- [ ] 충분한 evidence가 있는 rule만 runtime 적용한다.

초기에는 원문을 실제로 변형하기보다 NLU에 alias 또는 candidate hint를
제공하는 방식이 더 안전하다. 이렇게 하면 원문 span의 provenance를
잃지 않는다.

### Phase 6: Dynamic routing과 proposal

- [ ] `RoutingResult`와 `ActionProposal` contract를 추가한다.
- [ ] single candidate, ambiguous candidate, unsupported request,
  non-actionable 결과를 구분한다.
- [ ] routing confidence와 clarification reason을 기록한다.
- [ ] browser가 제출한 prediction을 신뢰하지 않고 서버의 pending
  inference를 source of truth로 사용한다.
- [ ] 단일 event와 batch event의 executor를 공통화한다.

완료 조건:

- proposal 생성은 state를 변경하지 않는다.
- confirmation이 없으면 event가 생성되지 않는다.
- 동일 inference를 두 번 commit할 수 없다.
- 모든 event는 proposal/inference와 추적 가능하게 연결된다.

### Phase 7: Stage-level evaluation

- [ ] relevance frozen evaluation set을 만든다.
- [ ] intent frozen evaluation set을 유지한다.
- [ ] slot/entity span 평가를 추가한다.
- [ ] normalization accuracy를 field별로 계산한다.
- [ ] resolution accuracy와 ambiguity rate를 계산한다.
- [ ] routing/clarification precision을 계산한다.
- [ ] multi-action exact match를 별도 계산한다.
- [ ] stage별 p50/p95 latency를 기록한다.

최소 평가 축:

```text
relevance
intent
entity span
normalization
entity resolution
routing
joint action
confirmation outcome
```

각 결과는 다음 slice로 나누어야 한다.

- phrase family
- input modality
- activation mode
- utterance length
- single-action/multi-action
- ambiguity
- multi-turn dependency
- unseen item
- relative date
- ASR noise가 있는 경우

### Phase 8: Conversation context와 DST

- [ ] `conversation_states`를 추가한다.
- [ ] 최근 turn의 허용된 context snapshot을 만든다.
- [ ] pronoun/reference 후보를 명시적 구조로 저장한다.
- [ ] clarification state를 저장하고 다음 turn에서 소비한다.
- [ ] context evidence turn을 prediction에 기록한다.
- [ ] TTL, household isolation, stale context policy를 구현한다.

완료 조건:

- `Put it on the list`가 이전 turn의 실제 entity를 근거로 resolve된다.
- 후보가 없거나 여러 개면 clarification이 생성된다.
- 다른 household 또는 만료된 conversation state가 사용되지 않는다.

### Phase 9: ASR와 Raspberry Pi

- [ ] push-to-talk부터 시작한다.
- [ ] provider-neutral ASR interface를 만든다.
- [ ] ASR transcript를 기존 Input stage에 연결한다.
- [ ] ASR WER/SER와 downstream NLU 오류를 분리 기록한다.
- [ ] item, brand, quantity, unit, date의 slot survival을 측정한다.
- [ ] cloud TTS를 먼저 연결한다.
- [ ] 짧은 fallback prompt는 local audio/local TTS를 검토한다.
- [ ] wake word는 push-to-talk와 text pipeline이 안정된 뒤 추가한다.
- [ ] barge-in과 full duplex는 마지막 단계로 둔다.

완료 조건:

- voice와 text가 같은 confirmation/event path를 사용한다.
- voice 오류가 별도 ASR 오류인지 NLU 오류인지 구분된다.
- 개인 adapter가 shared base나 global catalog를 오염시키지 않는다.

---

## 7. 기존 문서와의 연결

이 문서는 runtime language architecture의 canonical decision record다.
다른 문서는 전체 내용을 복사하지 않고 다음처럼 참조한다.

| 문서 | 반영할 내용 |
|---|---|
| `docs/ENG/planning/PLAN.md` | Language Understanding Architecture와 M5.5~M9 milestone에서 이 문서를 참조 |
| `docs/ENG/planning/LINEAR_NLU_PIPELINE_ROADMAP.md` | 이 결정의 단계별 구현 순서, migration, test, release gate |
| `docs/ENG/decisions/IMPLEMENTATION_NOTES.md` | 현재 구현 상태와 미구현 stage 목록 갱신 |
| `docs/ENG/planning/ACTION_ITEMS.md` | Phase 0~9의 실행 checkbox를 현재 작업 순서로 축약 |
| `docs/ENG/ml/ML_NLP_CONCEPTS.md` | relevance, intent, entity, normalization, resolution의 모델 분리 설명 |
| `docs/ENG/ml/MODEL_EVALUATION.md` | stage-level metrics와 routing/resolution slice 추가 |
| `docs/ENG/planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md` | ASR가 이 텍스트 pipeline 앞에 삽입된다는 점만 연결 |
| `docs/ENG/planning/PERSONALIZED_ASR_STRATEGY.md` | personal adapter와 ASR confusion layer의 상세 정책 |
| `docs/ENG/decisions/CONVERSATION_DATA_COLLECTION_DECISION.md` | relevance 수집과 향후 context/DST 데이터의 관계 |
| `docs/ENG/ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md` | base catalog와 entity linking의 catalog 정책 |

문서 구조상 이 결정은 영어 tree에 먼저 추가하고, 문서 유지 규칙에 따라
동일한 상대 경로의 Korean mirror를 나중에 추가한다.

---

## 8. 보안, privacy, 안전 요구사항

### 8.1 confirmation은 제거하지 않는다

relevance confidence, intent confidence, resolution confidence가 모두
높아도 state-changing event는 confirmation 전까지 저장하지 않는다.

### 8.2 household isolation

다음 정보는 household scope를 가진다.

- inventory/shopping candidate
- household alias
- correction-derived rewrite
- personal ASR confusion
- conversation state
- resolution history

다른 household의 alias나 context를 현재 요청에 사용하면 안 된다.

### 8.3 provenance

다음 값을 함께 보존한다.

```text
raw surface
normalized value
resolved entity
resolution source
model/parser version
user correction
confirmation outcome
```

사용자 교정은 곧바로 global truth가 아니다. household evidence와
annotation ground truth, catalog truth를 서로 다른 종류의 데이터로 유지한다.

### 8.4 correction rewrite의 위험

잘못된 rewrite가 이후 모든 입력을 같은 방식으로 왜곡할 수 있다.
따라서 처음에는 shadow mode와 hint 방식으로 검증하고, 반복성과
acceptance rate가 확인된 경우에만 자동 적용한다.

### 8.5 pending inference와 idempotency

proposal은 pending 상태로 존재할 수 있으므로 다음을 추가로 해결한다.

- 오래된 pending inference의 timeout
- 동일 inference의 중복 commit 방지
- event/correction/inference outcome의 atomicity
- 재시도 시 같은 event가 중복 생성되지 않는 idempotency key

---

## 9. 평가 및 성공 기준

### 9.1 기능적 성공

- non-actionable 발화가 inventory를 변경하지 않는다.
- actionable 발화는 intent와 entity span을 반환한다.
- normalization과 entity resolution이 별도로 관찰된다.
- ambiguous entity는 clarification으로 종료된다.
- confirmation 전에는 event가 생성되지 않는다.
- correction은 다음 학습/개선 cycle에서 추적 가능하다.
- multi-action은 action별로 보존된다.
- voice가 추가되어도 기존 text confirmation path가 유지된다.

### 9.2 실험적 성공

- relevance, intent, slot, normalization, resolution, joint metric을
  각각 계산할 수 있다.
- stage별 latency와 fallback을 비교할 수 있다.
- synthetic, reviewed human, generated candidate, actual correction을
  source별로 구분할 수 있다.
- phrase family와 household leakage가 평가 split에 들어가지 않는다.
- personal adapter의 개선과 shared base의 개선을 분리할 수 있다.

### 9.3 음성 단계 성공

- ASR WER/SER와 NLU metric이 별도로 보고된다.
- item/brand/quantity/unit/date의 structured slot survival을 보고한다.
- push-to-talk latency와 end-to-end confirmation latency를 측정한다.
- ASR 오류가 correction log에 저장되고 personal adapter 후보가 된다.
- cloud 장애 시 text/web handoff 또는 짧은 fallback response가 가능하다.

---

## 10. 결정 요약

Jangoing은 다음 구조를 채택한다.

```text
Input / Activation
-> Relevance Gate
-> optional FLARE-style correction hint
-> Kitchen NLU
-> deterministic normalization
-> shared catalog + household personal entity resolution
-> dynamic routing
-> action proposal
-> confirmation / correction
-> event executor
-> projection and response
```

핵심 구현 순서는 다음과 같다.

```text
contract 고정
-> runtime relevance
-> pipeline orchestrator
-> NLU/normalization 분리
-> entity resolution v1
-> correction reuse
-> routing/proposal hardening
-> stage evaluation
-> DST
-> ASR/Pi/TTS
```

Classic Alexa에서 가져오는 것은 “Alexa라는 제품”이 아니라,
단계가 분리되고 측정 가능하며 fulfillment 전에 해석을 구조화하는
아키텍처 원칙이다. Jangoing은 여기에 일반 대화 relevance와
household-scoped personalization을 추가하고, 기존의 human confirmation
원칙을 끝까지 유지한다.

---

## 참고 문서

- `docs/ENG/planning/PLAN.md`
- `docs/ENG/planning/LINEAR_NLU_PIPELINE_ROADMAP.md`
- `docs/ENG/decisions/IMPLEMENTATION_NOTES.md`
- `docs/ENG/decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md`
- `docs/ENG/decisions/CONVERSATION_DATA_COLLECTION_DECISION.md`
- `docs/ENG/planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md`
- `docs/ENG/planning/PERSONALIZED_ASR_STRATEGY.md`
- `docs/ENG/ml/TEXT_DATASET_DESIGN_V1.md`
- `docs/ENG/ml/MODEL_EVALUATION.md`
- `docs/ENG/ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md`
- 첨부 문서: `Classic Alexa Architecture for Jangoing.md`
