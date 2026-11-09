# Linear NLU Pipeline 실행 로드맵

## 문서 목적

이 문서는 Classic Alexa에서 가져온 선형 처리 원칙을 Jangoing의 현재
프로젝트 구조에 실제로 적용하기 위한 실행 계획이다.

아키텍처의 최종 형태와 설계 이유는
[LINEAR_NLU_PIPELINE_ARCHITECTURE.md](../decisions/LINEAR_NLU_PIPELINE_ARCHITECTURE.md)에
기록한다. 이 문서는 그 결정을 구현 가능한 작업 단위, 의존성, 검증
기준, 배포 순서로 나눈다.

현재 진행 중인 annotation 작업을 폐기하거나 중단하지 않는다. annotation은
NLU와 relevance 모델의 학습 데이터 기반으로 계속 진행하고, 이 로드맵은
그 데이터를 실제 런타임 pipeline에 연결하는 작업을 병렬로 추가한다.

## 1. 현재 상태와 목표

### 1.1 현재 런타임

현재 Jangoing의 핵심 흐름은 다음과 같다.

```text
Next.js 입력 UI
  -> POST /commands/interpret
  -> Worker의 rule-based parser
  -> typed interpretation
  -> 사용자 편집/확인
  -> confirmed event
  -> D1 events
  -> inventory/shopping projection
```

현재 구조의 강점은 다음과 같다.

- 확인 전에는 inventory state가 변경되지 않는다.
- `events`가 append-only source of truth 역할을 한다.
- `corrections`와 `inference_logs`로 예측과 실제 결과를 분리한다.
- annotation UI와 dataset export가 이미 존재한다.
- 날짜, 수량, 단위, item의 일부 정규화가 deterministic code로 구현되어
  있다.

현재 구조의 한계는 다음과 같다.

- relevance, intent, entity extraction, normalization, resolution이
  하나의 해석 결과 안에 묶여 있어 단계별 성능을 비교하기 어렵다.
- Worker가 요청을 해석하지만, 각 단계의 version과 latency를 일관되게
  기록하는 orchestrator 계약이 없다.
- item/category 이름의 canonicalization과 household별 alias가
  명시적인 resolution 단계로 분리되지 않았다.
- clarification과 correction은 UI 흐름에는 있지만, pipeline의
  독립적인 출력 타입으로 정의되지 않았다.
- 현재 모델 학습 계획은 존재하지만 production runtime의 shadow,
  fallback, rollback 순서가 충분히 구체화되어 있지 않다.

### 1.2 목표 런타임

```text
Input / Activation
  -> Relevance Gate
  -> optional correction hint
  -> Kitchen NLU
  -> deterministic normalization
  -> entity resolution
  -> dynamic routing
  -> action proposal
  -> confirmation / correction
  -> event executor
  -> projection and response
```

음성은 다음처럼 같은 pipeline 앞에 연결한다.

```text
Wake word / push-to-talk
  -> ASR
  -> 위의 Input 이후 pipeline
```

즉, 음성용 fulfillment path를 새로 만들지 않는다. Web text, push-to-talk,
향후 Raspberry Pi client는 동일한 `InterpretationResult`와
`ActionProposal` 계약을 사용한다.

## 2. 구현 원칙

### 2.1 단계마다 계약을 둔다

각 단계는 이전 단계의 전체 내부 객체를 임의로 읽지 않고, versioned
입력/출력 계약을 사용한다. 단계 계약이 고정되어야 rule-based baseline,
ML candidate, personal adapter를 같은 pipeline에서 비교할 수 있다.

### 2.2 해석과 실행을 분리한다

`InterpretationResult`와 `ActionProposal`은 실행 명령이 아니다. 확인이
필요한 proposal이 `confirmed` 상태가 된 뒤에만 event executor가
`events`에 기록한다.

### 2.3 확신이 낮으면 더 많은 자동화를 하지 않는다

relevance가 낮거나, entity 후보가 모호하거나, mutation 위험이 큰 경우에는
`unknown`, `clarification_required`, `confirmation_required` 중 하나로
종료한다. 낮은 confidence를 임의의 inventory mutation으로 변환하지 않는다.

### 2.4 공용 truth와 household preference를 분리한다

공용 catalog는 canonical identity를 제공한다. household alias와 개인의
발음/표현은 resolution 후보의 우선순위를 바꿀 수 있지만, 공용 catalog
자체를 조용히 변경하지 않는다.

### 2.5 먼저 측정하고 나중에 모델을 교체한다

모델을 추가하기 전에 deterministic baseline의 stage별 metric, latency,
fallback 비율, confirmation 결과를 저장한다. 새 모델은 shadow 또는
canary로 비교한 뒤에만 active path에 승격한다.

## 3. 의존성 그래프

```text
Phase 0: 계약과 관측성
       |
       +--> Phase 1: relevance gate
       |          |
       |          +--> Phase 2: pipeline orchestrator
       |                         |
       |                         +--> Phase 3: NLU/normalization 분리
       |                                      |
       |                                      +--> Phase 4: entity resolution
       |                                                     |
       |                                                     +--> Phase 5: correction reuse
       |                                                                    |
       |                                                                    +--> Phase 6:
       |                                                                         routing/proposal
       |                                                                                 |
       |                                                                                 +--> Phase 7:
       |                                                                                      stage evaluation
       |                                                                                               |
       |                                                                                               +--> Phase 8:
       |                                                                                                    DST
       |                                                                                                         |
       |                                                                                                         +--> Phase 9:
       |                                                                                                              ASR/Pi/TTS
```

Phase 0의 계약과 logging이 완료되기 전에는 모델 결과를 production
decision으로 사용하지 않는다. Phase 4의 entity resolution이 안정되기
전에는 household personal adapter를 active mutation path에 연결하지
않는다.

## 4. 작업 트랙

### Track A — 계약, versioning, observability

목표는 pipeline의 모든 단계가 재현 가능한 입력과 출력을 남기도록 만드는
것이다.

주요 산출물:

- `InterpretationRequest`
- `RelevanceResult`
- `CorrectionHint`
- `NluResult`
- `NormalizedAction`
- `ResolvedEntity`
- `ActionProposal`
- `PipelineTrace`
- stage별 version, latency, fallback, confidence, error code

예시 계약:

```ts
type PipelineStage =
  | "relevance"
  | "correction_hint"
  | "nlu"
  | "normalization"
  | "entity_resolution"
  | "routing"
  | "proposal";

type StageTrace = {
  stage: PipelineStage;
  status: "completed" | "skipped" | "fallback" | "clarify" | "rejected" | "failed";
  version: string;
  latency_ms: number;
  confidence?: number;
  reason_code?: string;
};
```

구현 위치:

- `packages/contracts/src/index.ts`: 외부 API와 공유하는 public contract
- `apps/api/src/nlp/pipeline-contracts.ts`: API 내부 stage와 trace contract
- `apps/api/src/`: 내부 stage 결과와 orchestrator
- `inference_logs`: 원문, context snapshot, stage trace, 최종 결과
- `corrections`: original proposal과 user-confirmed result

완료 기준:

- 같은 request ID와 pipeline version으로 한 해석을 재현할 수 있다.
- unknown, rejected, cancelled 요청도 stage trace를 남긴다.
- 원문과 household 식별자에는 기존 privacy/retention 정책이 적용된다.
- stage 추가가 기존 `interpret` response를 깨뜨리지 않는다.

### Track B — Relevance Gate

목표는 일반 대화에서 kitchen domain에 속하는 입력만 다음 단계로
전달하는 것이다.

입력 class는 기존 annotation 결정과 맞춘다.

- `actionable`
- `preference_context`
- `domain_non_actionable`
- `unrelated`
- `needs_clarification`

초기 구현 순서:

1. 기존 rule-based/TF-IDF relevance baseline을 pipeline 앞에 삽입한다.
2. `domain_non_actionable`과 `unrelated`를 별도 negative class로 보존한다.
3. confidence threshold 아래에서는 `needs_clarification` 또는
   `not_relevant`로 종료한다.
4. relevance 결과와 사용자가 실제로 확인/수정했는지를 logging한다.
5. reviewed relevance data가 충분해지면 DistilBERT 후보를 shadow로
   비교한다.

기존 연결 지점:

- `apps/api/src`의 `/commands/interpret`
- relevance annotation queue와 export
- `docs/ENG/decisions/CONVERSATION_DATA_COLLECTION_DECISION.md`
- `ml/`의 relevance dataset/evaluation 코드

완료 기준:

- unrelated 입력이 NLU와 mutation proposal까지 불필요하게 진행되지 않는다.
- contextual preference는 즉시 inventory mutation으로 오인되지 않는다.
- relevance threshold와 fallback 이유가 재현 가능하게 기록된다.

### Track C — Pipeline Orchestrator

목표는 각 stage를 명시적인 순서로 호출하고, stage 실패가 전체 요청에
미치는 영향을 통제하는 것이다.

권장 구조:

```text
runPipeline(request)
  -> runRelevance()
  -> runCorrectionHint()        // optional
  -> runKitchenNlu()
  -> runNormalization()
  -> runEntityResolution()
  -> runRouting()
  -> buildActionProposal()
  -> return proposal
```

각 stage는 다음 중 하나를 반환한다.

- `continue`: 다음 stage로 이동
- `fallback`: deterministic 또는 보수적 baseline 사용
- `clarify`: 사용자 질문을 생성하고 mutation 중지
- `reject`: domain 밖 또는 정책상 처리하지 않음
- `fail`: 운영 오류로 기록하고 안전한 오류 응답

구현 순서:

1. 현재 parser를 `runKitchenNlu`의 첫 baseline adapter로 감싼다.
2. 기존 `interpret` endpoint가 orchestrator를 호출하도록 바꾼다.
3. 기존 response shape을 유지하면서 내부 trace를 추가한다.
4. stage별 unit test와 전체 pipeline test를 추가한다.
5. 새 ML stage는 adapter로만 삽입할 수 있게 만든다.

완료 기준:

- stage 순서가 코드 한 곳에서 확인된다.
- stage가 생략된 경우에도 이유가 trace에 남는다.
- 기존 web UI는 변경 없이 기존 proposal을 계속 표시한다.
- orchestrator unit test가 정상, unknown, clarification,
  parser failure, multi-action을 포함한다.

### Track D — NLU와 deterministic normalization 분리

목표는 모델이 span/intent를 예측하고, 날짜·수량·단위·item의 canonical
값은 별도 단계가 책임지게 하는 것이다.

분리할 책임:

```text
NLU:
  intent, action group, raw entity span, confidence

Normalization:
  quantity, unit, expiry date, location, item surface form

Schema validation:
  required field, enum, type, action-specific constraints
```

구현 순서:

1. 현재 parser output을 raw NLU와 normalized value로 분리해 저장한다.
2. 날짜 normalization은 기존 `reference_date`, `timezone`,
   `inferred_at`을 계속 사용한다.
3. quantity/unit/location의 deterministic normalizer를 독립 함수로
   고정한다.
4. item/category normalization은 resolution 전의 후보 생성 단계로
   한정한다.
5. `packages/contracts`의 schema validation은 proposal 직전에 실행한다.
6. ML NLU가 추가되어도 deterministic normalizer와 schema validation을
   우회하지 못하게 한다.

완료 기준:

- NLU가 정확해도 normalization이 틀린 경우를 별도 metric으로 볼 수 있다.
- normalization 실패는 intent 실패로 숨겨지지 않는다.
- 날짜 해석은 request의 원래 context를 사용한다.
- validation 실패는 사용자 correction/clarification으로 연결된다.

### Track E — Entity Resolution

목표는 raw item mention을 실행 가능한 canonical entity 후보로 연결하는
것이다.

두 계층을 사용한다.

```text
shared base catalog
  -> 브랜드, item, category, aliases, hierarchy

household personal adapter
  -> household alias, 자주 쓰는 표현, correction-derived mapping
```

resolution 단계의 출력은 단일 문자열이 아니라 후보 목록이어야 한다.

```ts
type ResolvedEntity = {
  surface: string;
  candidates: Array<{
    entity_id: string;
    source: "shared_catalog" | "household_alias" | "context";
    score: number;
    matched_by: string;
  }>;
  selected_entity_id?: string;
  ambiguity: "none" | "low" | "high";
};
```

구현 순서:

1. 기존 normalized item/category 값을 canonical candidate로 취급한다.
2. shared catalog lookup과 alias lookup을 분리한다.
3. household alias 저장 schema와 authorization boundary를 추가한다.
4. correction에서 확실한 mapping만 personal adapter 후보로 기록한다.
5. 후보가 하나면 proposal에 연결하되, 위험한 mutation은 여전히 확인한다.
6. 후보가 여러 개면 clarification을 반환한다.

완료 기준:

- household alias가 다른 household에 노출되지 않는다.
- alias가 shared catalog 값을 덮어쓰지 않는다.
- correction-derived alias는 provenance와 confidence를 가진다.
- 모호한 entity가 임의의 첫 번째 candidate로 실행되지 않는다.

### Track F — FLARE-style correction hint와 correction reuse

목표는 사용자의 correction을 다음 해석의 후보 개선에 활용하되, 교정
문장을 원본 truth로 과대 일반화하지 않는 것이다.

처리 순서:

```text
raw input
  -> correction evidence 검색
  -> 안전한 rewrite/candidate hint
  -> NLU와 resolution에 보조 입력으로 전달
```

제약:

- correction hint는 원문과 별도로 저장한다.
- hint를 적용한 결과와 적용하지 않은 결과를 모두 평가할 수 있어야 한다.
- household 범위가 지정된 correction은 전역 모델 업데이트로 바로
  승격하지 않는다.
- hint가 confidence를 낮추거나 entity ambiguity를 만들면 사용하지 않는다.
- 사용자의 최종 confirmation이 training-quality evidence인지 여부를
  기존 annotation 정책으로 판단한다.

완료 기준:

- correction 적용 전후의 intent/entity exact match를 비교할 수 있다.
- hint가 무한 rewrite loop를 만들지 않는다.
- hint 실패 시 원래 deterministic baseline으로 되돌아간다.

### Track G — Dynamic Routing, Action Proposal, Confirmation

목표는 해석 결과를 실제 action proposal로 변환하는 지점을 명시하고,
실행 위험에 따라 확인 정책을 적용하는 것이다.

routing은 다음 정보를 사용한다.

- intent/action group
- normalized values
- resolved entity 후보
- household permissions
- conversation state
- confidence와 ambiguity
- action의 mutation risk

proposal 상태:

```text
draft
  -> confirmation_required
  -> confirmed
  -> cancelled
  -> corrected
  -> executed
```

권장 정책:

- inventory, shopping list, threshold를 변경하는 action은 확인한다.
- query와 clarification response는 mutation 없이 실행할 수 있다.
- entity가 모호하면 confirmation 대신 clarification을 먼저 요청한다.
- multi-action은 action별 proposal을 유지하되, 한 번의 confirmation에서
  사용자가 일부만 수정할 수 있게 준비한다.
- event executor는 `confirmed` proposal만 받는다.

완료 기준:

- proposal과 event가 별도 객체/단계로 구분된다.
- 사용자가 수정한 값이 original prediction을 덮어쓰지 않는다.
- confirmation/cancellation/correction이 모두 trace와 audit history에
  남는다.
- 기존 append-only event model을 유지한다.

### Track H — Stage Evaluation과 운영 관측성

목표는 전체 exact match만 보지 않고 각 단계의 실패 원인을 식별하는
것이다.

필수 metric:

| Stage | 주요 지표 |
| --- | --- |
| Relevance | macro-F1, actionable recall, unrelated false-positive rate |
| NLU | intent macro-F1, action-group exact match |
| Entity | span F1, candidate recall, resolution accuracy |
| Normalization | date/quantity/unit exact match |
| Routing | correct route rate, clarification precision |
| Proposal | end-to-end exact match, confirmation acceptance |
| Execution | mutation safety, rejected mutation count |
| System | p50/p95 latency, fallback rate, error rate |

평가 split:

- phrase family 기준 split
- household 기준 leakage 방지
- synthetic, reviewed human, production correction source 분리
- contextual conversation과 distractor turn 별도 slice
- personal adapter 사용 여부별 비교

구현 순서:

1. `PipelineTrace`와 stage result를 inference log에 저장한다.
2. 기존 `MODEL_EVALUATION.md`의 metric에 stage metric을 추가한다.
3. offline replay runner로 동일 request를 여러 pipeline version에
   실행한다.
4. shadow 결과와 사용자의 실제 confirmed outcome을 비교한다.
5. latency budget과 launch gate를 정한다.

완료 기준:

- 하나의 end-to-end 오류에서 최초 실패 stage를 찾을 수 있다.
- model version, parser version, normalizer version, dataset version이
  모두 기록된다.
- production rollout은 metric regression과 rollback 기준을 가진다.

### Track I — Conversation Context와 Dialog State Tracking

목표는 현재 turn만 해석하지 않고, 허용된 범위에서 이전 turn의 목표와
entity를 사용하되 stale state와 unrelated conversation을 구분하는 것이다.

최소 state:

- `conversation_id`
- 현재 turn index
- 활성 goal/action
- unresolved slots
- 최근 resolved entities
- reference date/timezone
- clarification/confirmation 상태
- state expiry와 source turn

구현 순서:

1. 기존 `conversation_id`, `turn_index`, `speaker_role` 입력을 유지한다.
2. `conversation_states` 저장소와 TTL/expiry 정책을 추가한다.
3. clarification turn에서만 unresolved slot을 자동 보충한다.
4. 새 turn이 다른 intent를 명확히 시작하면 기존 goal을 중지하거나
   stack에서 분리한다.
5. stale state와 distractor turn 평가를 추가한다.

완료 기준:

- 이전 turn의 entity가 무조건 새 요청에 재사용되지 않는다.
- state가 household/user 권한 밖의 정보를 노출하지 않는다.
- context를 사용한 결과와 사용하지 않은 결과를 비교할 수 있다.
- ambiguity가 남으면 mutation 대신 clarification을 반환한다.

### Track J — ASR, Raspberry Pi, TTS 연결

목표는 완성된 text pipeline 앞뒤에 음성 입출력을 연결하는 것이다.

연결 위치:

```text
push-to-talk / wake word
  -> ASR
  -> InterpretationRequest.text
  -> shared linear NLU pipeline
  -> ActionProposal / response
  -> TTS
```

원칙:

- ASR은 NLU의 hidden preprocessing으로 묶지 않고 별도 stage로 기록한다.
- WER/SER와 structured slot survival을 별도로 평가한다.
- shared base vocabulary와 household personal vocabulary를 분리한다.
- ASR correction은 personal adapter 후보가 될 수 있지만 자동 배포하지
  않는다.
- 음성에서도 확인 전 mutation 금지 원칙을 유지한다.

완료 기준:

- web text와 voice input의 proposal/event path가 동일하다.
- ASR 장애 시 text fallback 또는 명확한 오류 응답이 가능하다.
- Raspberry Pi latency, cloud timeout, retry, duplicate request를
  측정하고 처리한다.

## 5. 권장 마일스톤

### Milestone L0 — 계약 고정과 안전장치

순서:

1. public contract와 내부 stage result를 정의한다.
2. `PipelineTrace`를 추가한다.
3. 현재 parser를 baseline adapter로 감싼다.
4. 기존 confirmation/event path regression test를 고정한다.

종료 조건:

- 기존 web 사용 흐름이 깨지지 않는다.
- request 하나의 전체 trace를 조회할 수 있다.
- event 생성은 계속 confirmation 뒤에만 일어난다.

### Milestone L1 — Relevance와 orchestrator

순서:

1. relevance baseline을 pipeline 첫 번째 판단으로 추가한다.
2. unrelated와 domain non-actionable을 분리한다.
3. relevance fallback과 threshold를 logging한다.
4. orchestrator가 stage 순서를 소유하게 한다.

종료 조건:

- unrelated 요청이 mutation path로 진입하지 않는다.
- relevance false positive/negative를 별도 queue로 수집할 수 있다.

### Milestone L2 — NLU/normalization 분리

순서:

1. raw spans와 normalized values의 저장 구조를 분리한다.
2. date/quantity/unit/location normalizer를 독립 검증한다.
3. Zod schema validation을 proposal 경계에 둔다.
4. normalization 오류를 correction UI에서 수정할 수 있게 한다.

종료 조건:

- baseline의 stage별 metric이 생성된다.
- existing annotation export와 runtime contract가 충돌하지 않는다.

### Milestone L3 — Entity resolution v1

순서:

1. shared catalog lookup을 추가한다.
2. household alias를 별도 namespace로 추가한다.
3. 후보 점수와 ambiguity를 저장한다.
4. 모호한 후보를 clarification으로 보낸다.

종료 조건:

- canonical entity ID를 가진 proposal을 만들 수 있다.
- household data isolation test가 통과한다.

### Milestone L4 — Correction reuse와 proposal hardening

순서:

1. correction evidence를 search 가능한 구조로 만든다.
2. FLARE-style hint를 shadow로 실행한다.
3. routing과 action risk policy를 적용한다.
4. proposal state machine과 partial correction을 고정한다.

종료 조건:

- correction이 실제 offline metric을 개선하는지 확인된다.
- correction hint가 기존 결과보다 나쁠 때 자동으로 fallback한다.

### Milestone L5 — 모델 연결과 stage 평가

순서:

1. relevance 모델과 intent/slot 모델을 adapter로 연결한다.
2. deterministic baseline과 shadow 비교를 수행한다.
3. stage metric과 end-to-end metric을 모두 보고한다.
4. canary와 rollback을 준비한다.

종료 조건:

- 모델 승격 조건이 문서화되어 있다.
- 모델이 validation/schema/confirmation을 우회하지 않는다.

### Milestone L6 — Context와 voice

순서:

1. conversation state와 clarification context를 추가한다.
2. stale state/distractor 평가를 추가한다.
3. ASR을 text pipeline 앞에 연결한다.
4. Raspberry Pi와 TTS를 별도 latency budget으로 검증한다.

종료 조건:

- contextual request와 voice request가 동일한 안전한 event path를 사용한다.
- ASR 오류와 NLU 오류가 서로 구분된다.

## 6. 기존 프로젝트 파일과의 연결

| 기존 위치 | 현재 역할 | 새 접근에서의 역할 |
| --- | --- | --- |
| `apps/web/app/page.tsx` | 입력, 결과 편집, 확인 UI | `ActionProposal` 표시와 correction 입력 |
| `apps/web/lib/api.ts` | Worker API client | versioned interpretation/proposal API client |
| `apps/api/src` | parser, validation, event API | stage adapters와 orchestrator |
| `packages/contracts/src/index.ts` | 공유 TypeScript 계약 | public request/response와 proposal 계약 |
| `apps/api/src/nlp/pipeline-contracts.ts` | API 내부 contract | stage output과 trace 계약 |
| `events` | confirmed state change | 그대로 유지하는 실행 결과 |
| `corrections` | prediction과 confirmed 값 | correction evidence와 평가 source |
| `inference_logs` | inference context/log | 전체 stage trace와 version 저장 |
| `annotations` | reviewed action groups | relevance/NLU/entity 데이터 source |
| `ml/` | local train/eval | stage별 모델과 offline replay |
| `docs/ENG/planning/PLAN.md` | 장기 milestone | 이 로드맵과 milestone 연결 |
| `docs/ENG/planning/ACTION_ITEMS.md` | 즉시 체크리스트 | phase별 실행 상태 |
| `docs/ENG/planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md` | 음성 확장 | ASR/TTS adapter 상세 계획 |

### 파일 배치 원칙

새로운 stage가 생길 때마다 무조건 새 top-level package를 만들지 않는다.
초기에는 기존 `apps/api/src` 내부에 stage별 모듈을 두고, contract가
안정되고 독립 배포가 필요해질 때만 package를 분리한다.

권장 초기 구조:

```text
apps/api/src/
  interpretation/
    pipeline.ts
    relevance.ts
    nlu.ts
    normalization.ts
    entity-resolution.ts
    routing.ts
    proposal.ts
    trace.ts
  commands/
    interpret.ts
  events/
    execute-confirmed-proposal.ts
```

실제 디렉터리와 export 방식은 현재 Worker 구조를 확인한 뒤 적용한다.
이 문서는 파일명을 강제하기보다 책임과 경계를 먼저 고정한다.

## 7. 데이터베이스와 migration 계획

새로운 테이블을 한 번에 모두 만들지 않고, 각 stage의 실제 사용 시점에
맞춰 migration을 추가한다.

### 7.1 우선순위가 높은 schema

- `inference_logs.stage_trace_json`
- `inference_logs.pipeline_version`
- `inference_logs.input_source`
- `inference_logs.relevance_class`
- `inference_logs.final_outcome`
- `household_entity_aliases`
- `conversation_states`

### 7.2 migration 원칙

- 기존 `inference_logs`, `corrections`, `events`의 의미를 바꾸지 않는다.
- 새 column은 nullable 또는 backward-compatible default로 추가한다.
- event replay가 과거 row에 대해 계속 동작해야 한다.
- household alias에는 household authorization과 삭제 경로를 포함한다.
- conversation state에는 TTL 또는 명시적인 expiry를 둔다.
- 원문 음성과 개인 vocabulary의 retention은 별도 정책으로 둔다.

### 7.3 단계별 migration 순서

1. stage trace와 pipeline version
2. proposal/result 상태 확장
3. shared catalog reference
4. household alias
5. conversation state
6. ASR metadata와 personal adapter evidence

## 8. 테스트와 품질 gate

### 8.1 계약 테스트

- request와 response schema
- 이전 client가 새 response를 읽을 수 있는지
- unknown, clarification, rejected response
- multi-action action group

### 8.2 stage 단위 테스트

- relevance 경계값과 negative class
- intent와 entity span
- 날짜 reference context와 timezone
- quantity/unit/location normalization
- shared catalog와 household alias 우선순위
- ambiguity와 clarification
- correction hint 적용/미적용
- routing과 mutation risk

### 8.3 통합 테스트

- 입력 -> proposal -> confirmation -> event
- 입력 -> correction -> 재해석
- clarification -> 후속 turn -> proposal
- unrelated 대화 -> no mutation
- household A alias가 household B에 적용되지 않음
- 동일 request retry가 duplicate event를 만들지 않음

### 8.4 배포 gate

새 pipeline version은 다음 조건을 만족해야 한다.

- 기존 regression set에서 end-to-end exact match가 악화되지 않는다.
- mutation safety regression이 없다.
- stage latency budget을 초과하지 않는다.
- unknown/clarification 비율이 허용 범위 밖으로 증가하지 않는다.
- fallback과 rollback이 실제 환경에서 확인된다.

정확도가 개선되어도 confirmation 우회나 privacy boundary 침해가 있으면
승격하지 않는다.

## 9. 지금 당장 실행할 순서

현재 annotation 작업과 충돌하지 않는 가장 작은 시작점은 다음 네 가지다.

1. `apps/api/src/nlp/pipeline-contracts.ts`에서 pipeline stage 결과와
   trace 계약을 설계한다.
2. 현재 `/commands/interpret` parser를 baseline NLU adapter로 감싸고
   stage trace를 남긴다.
3. relevance 결과를 저장하고 unrelated/domain non-actionable 요청이
   다음 stage로 넘어가지 않게 한다.
4. 기존 confirmation과 event replay에 대한 regression test를 고정한다.

그 다음에만 entity resolution schema와 ML model adapter를 추가한다.
이 순서를 지키면 새 구조가 현재 annotation과 event sourcing을 깨뜨리지
않으면서 점진적으로 도입된다.

## 10. 구현 상태

### Step 1 — Stage contract와 PipelineTrace

상태: 계약과 순수 trace helper 구현 완료.

추가된 구성:

- `apps/api/src/nlp/pipeline-contracts.ts`
  - `PipelineStageSchema`
  - `StageStatusSchema`
  - `PipelineOutcomeSchema`
  - `StageTraceSchema`
  - `PipelineTraceSchema`
- `apps/api/src/nlp/pipeline-trace.ts`
  - trace builder 생성
  - stage append
  - 최종 trace 검증
- `apps/api/test/pipeline-trace.test.ts`
  - 정상 trace
  - 불변 append
  - version 길이 제한
  - reason code 길이 제한
  - 빈/순서 오류/중복 stage 거부

이번 단계에서는 현재 `/commands/interpret` 동작을 변경하지 않는다. 따라서
기존 parser의 결과와 public API response는 그대로 유지된다.

또한 `inference_logs`에 trace column을 아직 추가하지 않는다. 실제 runtime
orchestrator가 trace를 생성하고 저장하는 Step 2에서 migration과 함께
연결한다. 사용되지 않는 nullable column과 빈 trace row를 먼저 배포하지
않기 위한 결정이다.

보안·비용 제한:

- trace에는 raw utterance, access token, household profile, arbitrary JSON을
  저장하지 않는다.
- stage metadata의 version과 reason code는 safe identifier 형식만 허용한다.
- trace는 실제 선형 해석 stage를 한 번씩만, 순서대로 기록한다.
- 배열은 현재 7개 해석 stage를 넘지 않도록 제한한다.
- 제한을 schema에서 강제해 로그 부풀리기와 accidental PII 저장 위험을
  줄인다.

### Step 2 — 현재 parser의 baseline NLU adapter

상태: Worker와 local development server에 연결 완료.

추가된 구성:

- `apps/api/src/nlp/rules-nlu-adapter.ts`
  - 현재 `parseCommand()`를 변경하지 않고 NLU adapter 경계로 감싼다.
  - 기존 `Interpretation`을 그대로 반환한다.
  - `nlu` stage의 version, confidence, latency, safe reason code를 만든다.
- `apps/api/migrations/0022_add_pipeline_trace.sql`
  - `inference_logs.pipeline_version`
  - `inference_logs.stage_trace_json`
- `apps/api/src/index.ts`
  - production Worker가 adapter와 trace를 사용한다.
- `apps/api/src/dev.ts`
  - local development server도 같은 adapter와 migration을 사용한다.
- `apps/api/test/rules-nlu-adapter.test.ts`
  - 기존 parser 결과 보존과 unknown 처리 검증
- household integration test
  - inference log에 pipeline version과 NLU trace가 저장되는지 검증

이번 단계에서 의도적으로 하지 않은 것:

- relevance gate
- 별도 pipeline orchestrator
- public API response 변경
- event confirmation 규칙 변경

초기 adapter는 parser 내부 normalization을 그대로 감쌌지만, 다음 단계에서
그 경계를 실제 코드로 분리했다.

효율·보안 결정:

- 새 table이나 stage별 index를 추가하지 않고 기존 `inference_logs`에
  bounded JSON trace만 저장한다.
- trace에는 raw utterance나 household context를 복제하지 않는다.
- Worker와 local server가 서로 다른 parser 경로를 갖지 않도록 동일 adapter를
  공유한다.
- 기존 public response와 confirmation/event path를 유지해 rollback 비용을
  낮춘다.

### Step 3 — Runtime relevance gate

상태: deterministic baseline을 Worker와 local development server에 연결 완료.

추가된 구성:

- `apps/api/src/nlp/relevance.ts`
  - annotation과 동일한 네 가지 class를 사용한다.
  - `actionable`은 NLU로 전달한다.
  - `contextual_preference`, `domain_non_actionable`, `unrelated`는
    NLU 전에 종료한다.
  - 명확하지 않은 주방 관련 발화는 confidence `0.55`의 actionable
    fallback으로 NLU에 전달한다.
- `apps/api/migrations/0023_add_inference_relevance.sql`
  - `inference_logs.relevance_class`
  - `inference_logs.relevance_confidence`
  - `inference_logs.relevance_version`
- `apps/api/src/nlp/pipeline-contracts.ts`
  - `not_actionable` pipeline outcome과 relevance reason code를 추가한다.
- `packages/contracts/src/index.ts`
  - `Interpretation`에 optional relevance metadata를 추가한다.
  - `not_actionable`을 inference outcome vocabulary에 추가한다.

실행 정책:

```text
high-confidence actionable
-> relevance stage
-> rules NLU stage
-> 기존 proposal/confirmation path

low-confidence kitchen language
-> relevance fallback
-> rules NLU stage
-> parser 결과에 따라 clarification 또는 proposal

high-confidence non-actionable
-> relevance stage만 기록
-> NLU와 mutation review path를 실행하지 않음
-> inference outcome = not_actionable
```

효율·보안 결정:

- relevance는 parser를 호출하지 않고 제한된 deterministic vocabulary와
  pattern만 사용해 불필요한 NLU 비용을 줄인다.
- `inference_logs`에 nullable column만 추가하고 별도 relevance table이나
  index는 만들지 않는다.
- raw utterance는 기존 `raw_utterance` 한 곳에만 저장하며 trace와 relevance
  metadata에는 복제하지 않는다.
- 명시적인 kitchen vocabulary 없는 `Add my dentist appointment` 같은
  발화는 actionable pattern만으로 통과시키지 않는다.
- `not_actionable`은 사용자가 proposal을 거부한 `rejected`와 분리한다.

이번 단계에서 의도적으로 하지 않은 것:

- ML relevance classifier 배포
- 독립 frozen evaluation set 구축

### Step 4 — NLU와 normalization 분리

상태: rules baseline에 적용 완료.

구현:

- `apps/api/src/nlp/nlu-contracts.ts`
  - raw slot은 문자열 surface form으로 제한한다.
  - entity span은 `type`, `text`, `start`, `end`를 가진다.
  - span이 원문과 일치하고 utterance 범위를 넘지 않는지 검증한다.
- `apps/api/src/nlp/parse-command.ts`
  - `runRulesNlu()`는 intent, raw slot, confidence, raw span만 생성한다.
  - quantity 숫자 변환, plural alias, expiry ISO 변환을 수행하지 않는다.
- `apps/api/src/nlp/normalization.ts`
  - quantity, unit, item alias, location, expiry date를 canonical 값으로
    변환한다.
  - 기존 `reference_date`와 `timezone`을 그대로 사용한다.
- `apps/api/src/nlp/pipeline.ts`
  - `relevance -> nlu -> normalization` 순서와 각 stage 결과를 기록한다.
  - NLU 실패와 normalization 실패를 다른 reason code와 terminal stage로
    반환한다.

의도적인 단순화:

- 별도 raw-NLU DB table이나 normalization table을 추가하지 않는다.
- raw value를 `inference_logs`에 중복 저장하지 않는다.
- action별 별도 pipeline을 만들지 않고 하나의 linear trace 안에서 action
  구조를 보존한다.
- 현재 실사용자가 없으므로 runtime compatibility layer를 만들지 않는다.
  `parseCommand()`는 parser regression test용 thin helper다.

검증:

- raw NLU adapter test
- quantity/unit/date가 canonical 값으로 변환되는 기존 parser test
- 정상/unknown/relevance reject/NLU failure/normalization failure pipeline test
- household isolation trace test

### Step 5 — Shared catalog entity resolution

상태: shared catalog shadow resolver 적용 완료.

구현:

- `ml/taxonomy/grocery-v1.json`을 runtime catalog source로 사용한다.
- exact alias를 우선하고, `itemNameMatchKeys()` 기반 singular/plural
  fallback은 낮은 score로만 사용한다.
- 결과를 `resolved`, `ambiguous`, `unresolved`로 구분한다.
- 후보는 canonical key, category, matched alias, score, source를 가진다.
- 기존 `item_name`은 유지하고 `entity_resolution` metadata만 추가한다.
- multi-action은 action별 resolution을 유지한다.
- trace에 `entity_resolution` stage와 `catalog-v1` version을 기록한다.

의도적인 제한:

- household alias DB와 candidate lookup은 아직 추가하지 않는다.
- fuzzy/vector retrieval은 추가하지 않는다.
- unresolved/ambiguous 결과를 mutation 차단이나 clarification으로
  연결하지 않는다. 다음 routing 단계에서 정책을 결정한다.
- catalog를 D1에 복제하지 않아 migration, index, 동기화 비용을 만들지
  않는다.

### Step 6 — Household aliases와 correction reuse

상태: 저장 schema와 안전한 shadow hint builder 적용 완료. D1 자동 조회는
evaluation 단계까지 보류한다.

구현:

- `apps/api/migrations/0024_create_household_entity_aliases.sql`
  - household별 alias namespace
  - source, confidence, evidence count, creator, timestamp
  - household 삭제 시 cascade와 lookup index
- `apps/api/src/nlp/personal-adapter.ts`
  - correction evidence에서 반복 mapping만 추출
  - 최소 2회 동일 household evidence 요구
  - catalog canonical key로 검증된 correction만 hint 생성
- `apps/api/src/nlp/entity-resolution.ts`
  - household alias와 correction hint를 optional context로 수용
  - household ID가 일치하지 않는 context는 무시
  - 원문 rewrite 없이 candidate source와 confidence만 추가
- `apps/api/src/nlp/pipeline.ts`
  - `entityResolutionContext` 주입 경계 추가
  - 기본 runtime은 context 없이 shared catalog만 사용

안전·효율 정책:

- 한 번의 correction으로 alias를 만들지 않는다.
- personal alias를 shared catalog에 기록하지 않는다.
- 매 요청마다 D1을 조회하지 않는다.
- correction hint는 baseline을 대체하지 않고 candidate resolution에만
  참여한다.
- 실제 runtime 적용 전에는 hint 적용/미적용 exact match와 ambiguity를
  비교한다.
- relevance false-positive/false-negative annotation queue 자동화

### Step 7 — Routing과 ActionProposal

상태: deterministic routing과 confirmation-bound proposal 적용 완료.

구현:

- `apps/api/src/nlp/routing.ts`
  - intent를 허용된 event type으로 명시적으로 매핑한다.
  - mutation, read-only, clarification, reject를 구분한다.
  - destructive mutation risk와 clarification reason을 계산한다.
  - action별 proposal을 유지하고 batch event 순서를 검증한다.
- `apps/api/src/nlp/pipeline.ts`
  - entity resolution 뒤에 `routing`과 `proposal` stage를 추가한다.
  - `PipelineTrace`의 terminal stage를 proposal로 기록한다.
- `packages/contracts/src/index.ts`
  - `RoutingResultSchema`
  - `ActionProposalSchema`
  - `LoggedInterpretation`의 routing/proposal 응답 필드
- `/events`, `/events/batch`
  - browser의 원래 interpretation과 parser version을 신뢰하지 않는다.
  - pending inference에 저장된 interpretation에서 proposal을 재계산한다.
  - action count와 event type 순서가 일치할 때만 event를 append한다.
- `apps/api/migrations/0025_add_inference_commit_keys.sql`
  - `events(inference_id, action_index)` composite idempotency key
  - unique index로 single/batch 중복 commit을 차단한다.
- Worker D1 batch와 local SQLite transaction으로 event, correction,
  inference outcome, projection 갱신을 함께 commit한다.
- 동일 confirmation retry는 기존 event를 `200`으로 반환하고 event를
  추가하지 않는다.

정책:

- ambiguous entity와 필수 품목명 누락은 clarification으로 보낸다.
- catalog에 없는 unresolved 품목은 metadata를 보존한 mutation proposal로
  보낼 수 있지만, confirmation 없이는 event를 만들지 않는다.
- proposal은 state를 변경하지 않는다.
- proposal 전용 table, queue, learned ranker는 추가하지 않는다. 현재는
  저장된 inference에서 결정론적으로 재구성하는 편이 중복 상태와 비용이
  적다.

남은 안전성 작업:

- routing/clarification slice의 offline evaluation

검증:

- routing unit test
- 정상 mutation의 routing/proposal trace
- read-only query가 mutation으로 변환되지 않는지 검증
- unresolved custom item의 confirmation 경계 검증
- household batch event proposal 검증

---

### Phase 2 — Linear pipeline orchestrator

상태: Worker와 local development server가 공통 orchestrator를 사용하도록
연결 완료.

추가된 구성:

- `apps/api/src/nlp/pipeline.ts`
  - relevance → NLU stage 순서를 단일 함수가 소유한다.
  - temporal grounding을 NLU 입력에 결합하고, 로그용 context를 반환한다.
  - stage trace, parser/normalizer 실행 버전, inference outcome을 함께
    반환한다.
  - `continue`, `fallback`, `clarify`, `reject`, `fail` control 상태를
    내부 결과로 구분한다.
- `apps/api/test/pipeline.test.ts`
  - 정상 actionable path
  - relevance reject
  - fallback 후 clarification
  - parser failure와 안전한 failed trace

route handler의 책임은 request validation, inference log persistence,
public response serialization으로 제한된다. 실제 stage 실행과 순서는
orchestrator에만 존재한다.

효율·보안 결정:

- Worker와 local server가 서로 다른 stage 순서를 구현하지 않도록 공통
  pipeline 함수를 사용한다.
- parser 예외 메시지는 trace나 inference log에 저장하지 않고
  `rules_parser_failure`만 기록한다.
- 실패 시에도 state-changing event를 만들 수 있는 proposal을 반환하지
  않는다.
- 새 orchestrator table이나 별도 queue를 추가하지 않는다.

이번 단계에서 의도적으로 하지 않은 것:

- NLU 내부 normalization 로직 분리
- `ActionProposal`과 routing stage 도입
- ML adapter 또는 shadow model 연결
- relevance false-positive/false-negative annotation queue 자동화

## 참고 문서

- [선형 NLU 파이프라인 아키텍처 결정](../decisions/LINEAR_NLU_PIPELINE_ARCHITECTURE.md)
- [제품 및 모델 계획](./PLAN.md)
- [현재 실행 항목](./ACTION_ITEMS.md)
- [구현 노트](../decisions/IMPLEMENTATION_NOTES.md)
- [ML/NLP 개념](../ml/ML_NLP_CONCEPTS.md)
- [모델 평가 기준](../ml/MODEL_EVALUATION.md)
- [대화 데이터 수집 결정](../decisions/CONVERSATION_DATA_COLLECTION_DECISION.md)
- [Voice agent pipeline 및 Raspberry Pi 계획](./VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md)
