# jangoing 구현 설명서

## 1. 이 문서의 목적

이 문서는 현재 jangoing에 무엇을 구현했는지, 왜 그런 구조를 선택했는지,
검토했던 다른 선택지는 무엇인지, 그리고 아직 구현하지 않은 것은 무엇인지
기록한다. 코드가 바뀔 때 의사결정의 배경이 사라지지 않도록 유지하는 문서다.

## 2. 프로젝트의 현재 목표

jangoing의 단기 제품 형태는 주방 재고 및 쇼핑 목록 웹 앱이지만, 프로젝트의
핵심은 모델 학습과 검증이다. 제품 UI는 사용자가 실제 표현을 입력하고 모델의
해석을 검토·수정하게 만드는 데이터 수집 및 평가 환경 역할도 한다.

장기 목표는 명령문만 처리하는 파서가 아니다. 다음과 같은 일상 대화 안에서
관련 요청과 컨텍스트를 찾아야 한다.

- `We're out of drinks`에서 특정 상품명이 아니라 음료 카테고리를 인식한다.
- `I want to lose weight. What should I eat this week?`에서 목표, 선호, 재고,
  유통기한을 함께 사용해 추천한다.
- 쇼핑 목록의 상품에 대해 가격, 위치, 유효시간이 확인된 딜이나 대체품을
  추천한다.
- 무엇을 의미하는지 불명확하면 임의로 재고를 변경하지 않고 질문한다.

이 장기 기능들은 아직 구현된 상태가 아니다. 현재 구현은 이 목표에 필요한
검토 데이터와 비교 가능한 baseline을 만드는 첫 번째 학습 루프다.

## 3. 현재 실행 구조

```text
Vercel
  └─ apps/web: Next.js 웹 UI
          |
          v
Cloudflare Worker
  └─ apps/api: 해석, 검증, 이벤트 API
          |
          v
Cloudflare D1
  ├─ events
  ├─ corrections
  ├─ inference_logs
  └─ annotations (annotation-v2 action groups)

개발자 컴퓨터
  └─ ml/: 데이터 검증, 분할, 모델 학습, 평가
```

Python은 현재 Vercel이나 Cloudflare에 배포하지 않는다. `ml/`은 개발자
컴퓨터에서 학습과 평가를 실행하기 위한 도구다. 학습된 모델도 아직 production
요청 처리에 사용하지 않는다.

## 4. 적용한 기능

### 4.1 수정 가능한 해석 UI

기존 UI는 규칙 기반 파서가 반환한 결과를 읽고 확인하거나 취소하는 방식이었다.
현재는 저장 전에 다음 값을 수정할 수 있다.

- action/intent
- item
- quantity
- unit
- location
- expiration date

`unknown`으로 분류된 문장도 사용자가 올바른 action과 값을 입력해 복구할 수
있다. 재고를 변경하는 작업은 여전히 사용자의 명시적 확인 이후에만 저장된다.

관련 파일:

- `apps/web/app/page.tsx`
- `apps/web/app/globals.css`
- `apps/web/lib/api.ts`
- `packages/contracts/src/index.ts`

### 4.2 이벤트 저장

`events` 테이블은 실제로 확인된 주방 상태 변경을 저장한다. 현재 재고와 쇼핑
목록은 이벤트를 다시 재생해 계산한다. 파서가 어떤 예측을 했다는 이유만으로
이벤트가 만들어지지는 않는다.

이 구조를 선택한 이유:

- 잘못된 모델 예측이 자동으로 재고를 변경하지 않게 한다.
- 어떤 행동이 실제로 확인됐는지 추적할 수 있다.
- 이후 정정 이벤트나 감사 기록을 추가하기 쉽다.

### 4.3 correction 기록

`corrections` 테이블은 원래 예측과 사용자가 최종 확인한 해석을 별도로 저장한다.
수정이 없었던 확인도 사람이 검토한 정답 후보이기 때문에 기록한다.

관련 마이그레이션:

- `apps/api/migrations/0002_create_corrections.sql`

저장하는 핵심 값:

- 원문
- 원래 intent와 slots
- 최종 intent와 slots
- parser version
- 실제 수정 여부
- 연결된 event ID

### 4.4 모든 유효한 해석 시도 로깅

`inference_logs` 테이블은 사용자가 확인을 완료했는지와 무관하게 유효한 해석
요청을 먼저 기록한다. 각 요청에는 UUID 형태의 `inference_id`가 생성된다.

현재 저장하는 값:

- 원문
- 요청 컨텍스트
- 예측 결과
- 수정 결과가 생긴 경우 최종 결과
- parser, normalizer, schema version
- 입력 source
- 처리 지연시간
- pending, confirmed, corrected, cancelled, rejected outcome
- 연결된 event ID
- 생성 및 해결 시간

현재 요청 컨텍스트에는 수동 date picker의 `expiration_date`뿐 아니라 자연어 날짜
해석 기준으로 사용한 `reference_date`, 그리고 브라우저에서 보낸 `timezone`도 함께
저장한다.

관련 마이그레이션:

- `apps/api/migrations/0003_create_inference_logs.sql`

웹에서 확인하면 해당 inference가 `confirmed` 또는 `corrected`가 되고, 취소
버튼을 누르면 `cancelled`가 된다. event 생성 요청은 실제 pending inference ID가
있어야 승인된다.

이 구조를 선택한 이유:

- 이벤트만 저장하면 실패, unknown, 취소 사례가 사라진다.
- 실패 사례가 사라지면 모델의 실제 error distribution을 알 수 없다.
- 모델 버전별 correction rate와 latency를 비교할 수 있어야 한다.
- 학습 데이터와 제품 행동 데이터를 구분할 수 있어야 한다.

### 4.5 학습 데이터 export

`apps/api/scripts/export-dataset.ts`가 검토 완료 데이터를 JSONL로 내보낸다.
현재 supervised export에는 annotation 또는 신뢰할 수 있는 reviewed outcome이
있는 record만 포함한다. pending과 cancelled에는 정답이 없으므로 제외한다.
또한 하나의 mixed output 대신 학습용과 평가용을 별도 파일로 강제하고, 같은
정규화 문장이나 phrase family가 두 split에 동시에 들어가면 실패시킨다.

로컬 SQLite에서 export:

```bash
npm run dataset:export -- \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

production D1에서 export:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

로컬 명령은 `npm run dev:api`를 실행해 생성된
`apps/api/.local/jangoing.sqlite`를 읽는다. `--remote`는 Wrangler 인증을
사용해 Cloudflare D1을 읽는다.

export를 API의 공개 GET endpoint로 만들지 않은 이유는 원문 대화 데이터가
인터넷에 노출될 위험이 있기 때문이다. 현재는 로컬 또는 인증된 Wrangler
명령으로만 export한다.

export JSONL에는 reviewed intent/action 정보 외에도 원문 해석 당시의
`reference_date`와 `timezone`이 함께 들어간다. 이 값은 나중에 자연어 날짜
normalization 규칙을 다시 적용하거나 오류를 재현할 때 필요하다.

이제 export는 train/evaluation 분리뿐 아니라 task별 필터도 지원한다.

- 기본값 `--task intent`: reviewed corrected record도 포함 가능
- `--task slots`: annotation이 있는 row만 포함
- `--task joint`: annotation이 있는 row만 포함
- `--require-annotation`: intent export에서도 annotation row만 강제 가능

즉, annotation이 없는 corrected record는 intent 학습에는 활용할 수 있지만 entity
span supervision에는 자동으로 제외된다. 다음 부족한 부분은 filter 자체가 아니라
reviewed annotation의 normalized value completeness와 single-action baseline gate다.

### 4.6 첫 intent baseline

`ml/train_baseline.py`는 다음 모델을 학습한다.

```text
TF-IDF + Logistic Regression
```

이 모델은 현재 intent 분류만 담당한다. item, quantity 등의 slot 모델은 아직
학습하지 않는다.

기록하는 결과:

- dataset SHA-256
- Git commit
- random seed
- Python version
- train/validation/test 개수
- intent별 precision, recall, F1
- macro average
- confusion matrix
- 직렬화된 모델 파일

TF-IDF baseline을 먼저 선택한 이유:

- GPU 없이 CPU에서 빠르게 학습된다.
- 데이터와 평가 파이프라인 오류를 발견하기 쉽다.
- 이후 DistilBERT나 다른 모델이 실제로 개선됐는지 비교할 기준이 된다.
- 적은 데이터에서 복잡한 모델을 먼저 사용해 생기는 과적합을 피할 수 있다.

### 4.7 영어 synthetic-v1

영어 800개 bootstrap 데이터, 다국어 확장형 taxonomy, entity span, manifest,
자동 검증기를 추가했다. `needs_clarification`을 별도 intent로 저장할 수 있도록
웹 검토 흐름도 확장했다. 상세 결정과 결과는
[SYNTHETIC_V1_KO.md](../ml/SYNTHETIC_V1_KO.md)에 기록한다.

### 4.8 표현군 기준 데이터 분할

`ml/src/jangoing_ml/split.py`는 동일한 `phrase_family`가 train과 test에 동시에
들어가지 않게 그룹 단위로 분할한다.

예를 들어 다음 문장들은 단어만 바꾼 동일 템플릿일 수 있다.

```text
We're out of milk
We're out of eggs
We're out of juice
```

무작위 행 단위 분할을 하면 거의 같은 문장이 train과 test에 들어가 점수가
부풀려질 수 있다. grouped split은 이 leakage를 줄이기 위해 선택했다.

일반 correction record에는 문장 형태 기반 heuristic family를 사용할 수 있지만,
`/annotate` record는 intent별 controlled semantic family를 사람이 선택한다.

### 4.9 Production annotation workspace

`/annotate`는 서비스용 주방 화면과 분리된 공개 데이터 라벨링 화면이다. 실제 영어
문장을 입력하고 다음 정답을 저장한다.

- dataset purpose: `train_candidate` 또는 `evaluation_candidate`
- action별 intent와 phrase family
- action별 정확한 원문 entity span
- label별 controlled normalized value
- 판단 근거 notes

공개 화면은 기존 사용자의 원문을 자유 탐색하는 리스트는 제공하지 않는다. 대신
annotation workflow에 필요한 경우에만 queue에서 우선순위가 높은 샘플 하나를
불러올 수 있다. 현재 queue 종류는 correction, expiry, low-confidence,
confirmed, evaluation holdout이다. 따라서 대량 browse 위험은 줄이되 데이터
수집 효율은 높였다. 인증 없는 쓰기로 인한 품질·abuse 위험은 여전히 남아 있다.

관련 마이그레이션:

- `0004_create_annotations.sql`
- `0005_add_annotation_actions.sql`

### 4.10 annotation-v2 multi-action 구조

한 문장에 여러 독립 요청이 있을 수 있으므로 단일 `intent` 대신 1~8개의 action을
저장한다.

```json
{
  "actions": [
    {"intent": "add_to_buy", "entities": ["milk"]},
    {"intent": "throw_away", "entities": ["spinach"]}
  ]
}
```

각 action이 intent, phrase family, entities, normalized object를 소유한다. 동일한
원문 span은 실제로 필요하면 여러 action에 연결할 수 있지만 한 action 내부에서는
겹치는 span을 허용하지 않는다. 기존 v1 row는 유지하며 새 row의 legacy column에는
첫 action을 기록해 운영 호환성을 보존한다. 정식 export는 `actions`를 원본으로 쓴다.

현재 TF-IDF 모델은 single-intent classifier다. multi-action record를 첫 intent로
왜곡하지 않으며 학습에서 제외하고 제외 개수를 metrics에 남긴다.

### 4.11 Dynamic annotation normalized values

normalized value를 완전 자유 입력으로 두면 drift가 생기고, 완전 고정 dropdown으로
두면 실제 item coverage가 너무 좁아진다. 현재는 두 극단 사이의 절충 구조를 쓴다.

- ITEM/CATEGORY/UNIT: 기존 canonical 값 추천 + 새 canonical 값 직접 입력
- QUANTITY: 숫자 입력 + 기존 숫자 추천
- LOCATION: `fridge`, `freezer`, `pantry` 고정
- EXPIRY_DATE: ISO date picker
- phrase family: 선택한 intent에 맞는 semantic family 고정

shared contract의 `AnnotationNormalizedValues`는 초기 seed 목록으로 유지한다. 동시에
API의 `GET /annotations/normalized-values`가 reviewed annotation의 `actions` JSON을
읽어 label별 distinct normalized value를 모은다. `/annotate`는 이 응답을 받아 추천값
목록을 만들고, annotator가 새 ITEM/CATEGORY/UNIT 값을 저장하면 같은 세션과 이후
annotation에서 바로 재사용할 수 있다.

즉, 새 canonical 값은 approval queue를 기다리지 않는다. 다만 의미가 불확실한데
값만 새로 만드는 것은 금지한다. 그 경우는 normalized value 사전 확장이 아니라
annotation 판단 문제로 보고 span 또는 intent부터 다시 본다.

### 4.12 입력 및 진행률 UX

- Enter: sample 생성
- Shift+Enter: 줄바꿈
- IME 조합 중 Enter: 제출 방지
- Queue buttons: correction, expiry, low-confidence, confirmed, evaluation holdout
- Training candidate 초기 목표: 100~200
- Evaluation candidate 초기 목표: 100+

카운터는 production D1을 purpose별로 집계하고 저장 직후 UI에서도 즉시 증가한다.
목표 수치는 수집 진행 표시이며 데이터 품질, intent 균형, phrase-family 독립성을
보장하지 않는다.

queue를 분리한 이유:

- correction: 모델이 틀렸던 실사용 사례를 빠르게 회수
- expiry: 날짜 표현이 들어간 문장을 집중 수집
- low-confidence: active-learning 성격으로 어려운 문장을 우선 라벨링
- confirmed: 실제 분포에서 이미 맞은 문장을 보강
- evaluation holdout: 재현 가능한 규칙으로 검증셋 후보를 분리

### 4.13 Production 상태

- D1 migration: 0005까지 적용
- Worker: `https://jangoing-api.letmetellu.workers.dev`
- frontend: 기존 Vercel 프로젝트가 GitHub `main`에서 배포
- Python: 여전히 로컬 학습/평가 전용이며 별도 배포하지 않음

### 4.14 자연어 expiry date normalization

`chrono-node`를 사용해 explicit expiry phrase를 ISO 날짜로 정규화한다. 현재 지원
범위는 다음처럼 expiry marker가 분명한 문장이다.

- `Add milk expiring tomorrow`
- `Add eggs expires next Friday`
- `Add eggs with expiry date on August twenty-eighth`

이 기능은 자유로운 모든 date phrase를 해석하려는 것이 아니다. 일반 명사구 안의
날짜 표현을 무조건 expiration으로 취급하면 item span을 오염시키기 쉽기 때문에,
현재는 `expiring`, `expires`, `expiry date`, `with expiry date` 같은 marker가
있을 때만 파싱한다.

### 4.15 Inventory category 자동 분류와 사용자 override

Inventory 화면은 item name keyword로 display category를 자동 계산한다. 이
자동값은 item 추가와 fridge setup에서 사용자가 category를 반드시 입력하지 않아도
되는 기본값이다.

자동 분류가 틀린 경우에는 item 편집 화면의 `Category` row에서 다음 중 하나를
선택할 수 있다.

- `Automatic (현재 자동값)`: 저장된 override를 제거하고 자동 분류 사용
- `Produce`, `Dairy & Eggs`, `Drinks` 등 controlled category
- `Other`: 현재 목록에 맞는 category가 없는 경우

자유 텍스트 대신 enum을 사용하는 이유는 `Drink`, `Drinks`, `Beverage`처럼 UI
grouping 값이 분산되는 것을 방지하기 위해서다. 새 category가 필요하면 taxonomy와
enum을 함께 확장해야 한다.

선택한 override는 local storage가 아니라 `item_adjusted` event의 `category`에
저장된다. 따라서 여러 기기와 production DB에서 동일하게 보이며, 이후 quantity,
unit, location, expiry를 편집해도 최신 category가 유지된다. `Automatic`을
선택하면 event에 내부 marker `automatic`을 기록해 override를 명시적으로
해제한다. category 값이 없는 기존 또는 fridge setup adjustment는 override를
변경하지 않는다.

projection 결과의 `InventoryItem.category`는 **사용자 override만** 나타낸다.
값이 `null`이면 Web이 기존 deterministic fallback을 적용한다.

이 category는 annotation의 `CATEGORY` entity와 목적이 다르다.

- inventory category override: 제품 화면의 item grouping metadata
- annotation `CATEGORY`: `drinks`, `fruit`처럼 발화에 실제 등장한 상위 개념

분리한다고 해서 inventory override를 taxonomy 학습에서 버리는 것은 아니다.
두 값은 서로 다른 supervision으로 보존한 뒤 catalog layer에서 연결해야 한다.

예:

```text
Utterance: "We're out of Coke Zero."
Annotation: ITEM("Coke Zero") -> coke_zero
Inventory override: coke_zero -> drinks
```

이 문장에는 `drinks`라는 surface span이 없으므로 annotation에 `CATEGORY`를
추가하면 잘못된 span label이 된다. 반면 사용자가 고른 `Drinks`는
`coke_zero belongs_to drinks`라는 item-category relation의 유효한 evidence다.

따라서 향후 `grocery-v2`에서는 다음처럼 사용한다.

```text
item_category_evidence
  item_id: coke_zero
  category_id: drinks
  source: user_inventory_override
  scope: household
  event_id: ...
  observed_at: ...
```

- household에서는 사용자의 선택을 즉시 grouping에 적용
- global taxonomy에는 provenance가 있는 relation proposal로 축적
- annotation `CATEGORY`에는 실제 category 표현이 발화에 있을 때만 반영
- 같은 mapping이 annotation, catalog, external data에서도 확인되면 confidence 증가

현재 controlled enum은 category **membership coverage**를 넓히지만 category
종류 자체를 추가하지는 않는다. `Other` 선택은 taxonomy gap 신호다. 반복되는
`Other`를 새 category로 만들려면 별도의 `Suggest category` proposal이 필요하며,
자유 텍스트를 곧바로 global canonical category로 승격해서는 안 된다.

관련 파일:

- `apps/api/migrations/0011_add_inventory_category.sql`
- `apps/api/src/domain/projections.ts`
- `apps/web/app/page.tsx`
- `packages/contracts/src/index.ts`

## 5. 검토한 다른 선택지

### 5.1 처음부터 DistilBERT 학습

가능하지만 선택하지 않았다. 현재 실제 검토 데이터가 부족하고 데이터 분할 및
평가 루프도 막 만들어진 단계다. 복잡한 모델부터 사용하면 높은 점수가 모델의
능력 때문인지 데이터 leakage 때문인지 구분하기 어렵다.

향후 TF-IDF baseline을 확정한 뒤 DistilBERT intent classifier와 동일한 frozen
test set에서 비교한다.

### 5.2 LLM API로 모든 요청 해석

빠르게 자연스러운 데모를 만들 수 있는 선택지다. 하지만 다음 문제가 있다.

- 모델이나 provider 업데이트에 따라 결과가 달라질 수 있다.
- 비용과 네트워크 의존성이 생긴다.
- 정확한 재현과 세부 오류 분석이 어려울 수 있다.
- 개인 대화 및 주방 데이터의 외부 전송 정책이 필요하다.

장기적으로 LLM을 teacher, fallback, 또는 context reasoning 구성요소로 비교할 수
있지만, 항상 버전·prompt·latency·비용을 기록하고 같은 평가셋에서 비교해야 한다.

### 5.3 하나의 테이블에 이벤트와 예측을 모두 저장

스키마가 단순해지지만 선택하지 않았다. 예측은 실패하거나 취소될 수 있고,
이벤트는 사용자가 실제 승인한 상태 변경이다. 두 개념을 합치면 실패 데이터가
사라지거나 확인되지 않은 행동이 이벤트처럼 취급될 위험이 있다.

그래서 `inference_logs`, `corrections`, `events`를 분리하고 ID로 연결했다.

### 5.4 Python API를 지금 별도 배포

FastAPI 등을 이용해 모델 서버를 배포할 수 있지만 아직 하지 않았다. 현재 모델은
baseline일 뿐 production parser보다 낫다는 증거가 없다. 서버를 먼저 만들면
운영 비용과 장애 지점만 늘어난다.

배포 가능한 향후 선택지:

- 별도 Python inference service
- ONNX 변환 후 Raspberry Pi에서 로컬 추론
- 지원되는 런타임을 이용한 edge inference
- 외부 모델 API

선택은 정확도, p95 latency, 비용, 개인정보, 오프라인 요구사항을 측정한 뒤 한다.

### 5.5 무작위 데이터 분할

구현은 쉽지만 유사 템플릿 leakage 위험 때문에 기본값으로 선택하지 않았다.
표현군 단위 분할을 사용하고, 최종 test set은 학습 중 수정하지 않는 방향을
선택했다.

### 5.6 MLflow 또는 Weights & Biases 즉시 도입

실험 대시보드를 바로 얻을 수 있지만 현재는 첫 baseline 단계라 로컬
`metrics.json`과 artifact metadata로 시작했다. 실험 수가 늘어나고 여러 사람이
협업하기 시작하면 MLflow, W&B 또는 managed registry를 비교해 도입할 수 있다.

## 6. 현재 구현하지 않은 것

다음 항목은 계획에는 있지만 아직 동작하지 않는다.

- DistilBERT intent 모델
- slot extraction 모델
- `drink -> beverage` 형태의 production category resolver
- multi-turn 대화 context retrieval
- 사용자 목표, 선호, 알레르기, 예산 프로필
- 식단 또는 상품 추천 ranking
- 가격 및 딜 공급자 연동
- 온라인 A/B 평가 및 모델 registry dashboard
- Python 모델의 production inference 배포
- multi-action/multi-label 학습 baseline
- annotation 수정·삭제·합의 검토 및 더 강한 권한 제어가 있는 queue

일반 correction UI는 normalized slot 값만 저장하지만, 별도 `/annotate` 화면에서
원문의 정확한 문자 범위와 entity label을 저장할 수 있다. 이 데이터는 향후
token-level slot 모델 학습 후보로 export된다.

## 7. 현재 한계와 주의사항

### 데이터 양

실제 검토 데이터가 거의 없으면 모델 점수는 의미가 없다. 현재 UI의 초기 목표는
training candidate 100~200개와 independent evaluation candidate 100개 이상이다.
그다음 intent·phrase family·난이도별 부족분을 확인해 250~400개 이상으로 확장한다.

### 개인정보

`inference_logs`에는 사용자가 입력한 원문이 포함된다. production 데이터를
학습에 사용할 때는 보존 기간, 삭제 요청, 접근 권한, 비식별화 정책을 먼저
확정해야 한다. JSONL 파일은 Git에 포함되지 않도록 ignore되어 있다.

### pending 기록

사용자가 브라우저를 닫거나 새 문장을 입력해 화면을 이탈하면 일부 inference가
pending으로 남을 수 있다. 현재 취소 버튼은 기록되지만 자동 timeout 정리는 아직
구현되지 않았다.

### invalid request

스키마 검증을 통과하지 못한 빈 문자열이나 malformed JSON은 inference로 저장하지
않는다. 운영 보안 로그와 모델 학습 로그는 목적이 다르므로, 이런 요청은 향후
별도의 API observability 계층에서 집계하는 것이 적절하다.

### 원자성

event, correction, inference outcome은 논리적으로 연결돼 있지만 현재 모든 저장이
하나의 명시적 데이터베이스 transaction으로 묶여 있지는 않다. 트래픽과 장애
복구 요구가 커지기 전에 D1 batch/transaction 전략과 idempotency key를 추가해야 한다.

## 8. 실행 방법

### 웹과 로컬 API

```bash
npm install
npm run dev:api
npm run dev:web
```

### production 마이그레이션과 API 배포

```bash
npm run db:migrate:remote
npm run deploy:api
```

`npx wrangler deploy`를 직접 실행하려면 저장소 루트가 아니라 `apps/api`에서
실행해야 한다.

### Python 환경

Python 3.11 이상이 필요하다.

```bash
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'
```

### production 데이터 export 및 baseline 학습

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
python ml/train_baseline.py ml/data/reviewed-train.jsonl
```

slot span 실험용 export 예시:

```bash
npm run dataset:export -- --remote --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

결과는 기본적으로 `ml/artifacts/baseline/`에 생성되고 Git에는 포함되지 않는다.

## 9. 검증한 내용

- TypeScript parser/projection/annotation schema 테스트 11개
- 전체 TypeScript typecheck
- Cloudflare Worker dry build
- Next.js production build
- Python synthetic/split/multi-action loader 테스트 3개
- 20개 fixture를 이용한 CPU baseline 학습 및 평가
- 실제 로컬 API 요청의 inference ID 발급과 cancelled outcome 저장
- 로컬 SQLite에 두 action 저장 및 action별 entity/normalized JSONL export
- desktop 및 390px mobile annotation UI 확인
- production migration 0005 적용, Worker 배포, health/stats 응답 확인

fixture에서 나온 점수는 기능 smoke test일 뿐 모델 성능을 의미하지 않는다.

## 10. 다음 권장 작업

1. synthetic-v1으로 재현 가능한 첫 baseline artifact를 확정한다.
2. `/annotate`에서 training candidate 100~200개를 수집한다.
3. template와 모델 예측을 보지 않고 evaluation candidate 100개 이상을 수집한다.
4. reviewed annotation에서 normalized value completeness 규칙을 강화한다.
5. intent·phrase family·난이도별 분포와 중복을 검토한다.
6. evaluation candidate를 validation과 frozen test로 승인·분리한다.
7. reviewed training data와 synthetic data의 혼합 비율을 실험한다.
8. 수집된 entity span으로 slot baseline과 category resolver를 구현한다.
9. multi-action record가 충분해지면 multi-label/structured baseline을 만든다.
10. 같은 frozen test set으로 DistilBERT와 TF-IDF baseline을 비교한다.
11. annotation/debugging 흐름에 date context visibility가 더 필요한지 확인한다.
12. 인증, rate limit, pending timeout, idempotent/atomic 저장을 보강한다.

모델 이름보다 먼저 지켜야 할 원칙은 데이터의 정답성, 분할의 공정성,
실험의 재현성, 그리고 확인되지 않은 상태 변경을 막는 것이다.

## 11. Annotation AI 비용 통제와 사용량 기록

OpenAI 기반 draft는 기본적으로 `gpt-4.1-mini`를 사용한다. 한 번의
`Draft with AI` 요청은 한 번의 모델 호출이며, 출력은 최대 500토큰으로
제한한다. UI는 요청 처리 중 버튼을 비활성화해 반복 클릭을 막는다.

마이그레이션 `0007_log_annotation_ai_usage.sql`은 각 proposal에 다음 값을
저장한다.

- `input_tokens`: 실제 입력 토큰 수
- `output_tokens`: 실제 출력 토큰 수
- `estimated_cost_usd`: 당시 코드에 설정된 단가로 계산한 예상 비용

현재 계산식은 `gpt-4.1-mini`의 입력 $0.40/100만 토큰, 출력
$1.60/100만 토큰을 기준으로 한다. `OPENAI_MODEL`을 다른 모델로 변경하면
단가 계산도 함께 바꿔야 한다. API가 없는 parser fallback은 세 값 모두
`null`로 저장한다.

초기 운영 한도는 월 $5이다. 현재 계정 화면에서 프로젝트별 달러 hard limit을
직접 설정할 수 없어서 Worker가 이번 달 `estimated_cost_usd` 합계를 확인하고
$5 이상이면 새 draft 요청을 HTTP 429로 차단한다. 환경 변수
`OPENAI_MONTHLY_BUDGET_USD`로 값을 바꿀 수 있다. 이 한도는 annotation draft
경로에 대한 애플리케이션 안전장치이며, 같은 OpenAI 프로젝트의 다른 API key나
다른 애플리케이션 사용량까지 막는 조직 전체 결제 한도는 아니다.
