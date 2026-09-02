# 공개 데이터셋 조사 및 도입 계획

## 목적

이 문서는 `jangoing`의 영어 NLU/annotation/model bootstrap에 참고할 수 있는
공개 데이터셋을 정리한다. 목표는 "그냥 많이 가져오기"가 아니라, 각 데이터셋을
어떤 목적으로 써야 하는지와 `jangoing` schema로 얼마나 직접 연결되는지를
명확히 구분하는 것이다.

핵심 결론부터 말하면:

- `fridge inventory + grocery note + voice command`에 정확히 맞는 공개셋은 거의 없다.
- 따라서 **general assistant NLU dataset + grocery domain dataset + 자체 annotation**
  의 조합이 현실적이다.
- 최종 모델 품질은 결국 `jangoing` production annotation이 결정한다.
  공개셋은 bootstrap과 vocabulary 확장, OOD 감각 보강용이다.

## 우선순위 요약

### P0: 바로 검토할 것

- `AmazonScience/massive`
- `benayas/snips`
- `empathyai/grocery-ner-dataset`
- `AmirMohseni/GroceryList`

### P1: 다음 단계에서 참고할 것

- `pfb30/multi_woz_v22`
- `FunDialogues/customer-service-grocery-cashier`
- Instacart 계열 공개 데이터

### P2: 보조 참고만 할 것

- `sonos-nlu-benchmark/snips_built_in_intents`
- 소규모 shopping assistant / grocery chatbot 데이터셋들
- product catalog / grocery classification / receipts 계열 데이터셋들

## 데이터셋별 평가

### 1. `AmazonScience/massive`

- 성격:
  대규모 multilingual assistant NLU dataset
- 규모:
  1M+ utterances, 51 languages, 60 intents, 55 slot types
- 장점:
  intent classification과 slot tagging 파이프라인 자체를 검증하기 좋다.
  영어만 써도 충분히 크고, 나중에 한국어 확장 가능성도 열려 있다.
- 단점:
  grocery inventory 도메인에 직접 맞는 intent 체계가 아니다.
  `jangoing` intent에 그대로 복사 매핑하면 label semantics가 흔들린다.
- `jangoing`에서의 역할:
  direct training set이 아니라 **architecture/bootstrap benchmark**.
  예를 들어 `intent classifier`, `slot tagger`, `CRF/BERT head`, `evaluation code`
  가 제대로 도는지 검증하는 용도다.
- 권장 사용:
  `separate pretraining / smoke benchmark`
- 비권장 사용:
  MASSIVE label을 그대로 `add_item`, `mark_low`, `throw_away`로 강제 매핑

### 2. `benayas/snips`

- 성격:
  classic voice-assistant NLU dataset
- 장점:
  작고 단순해서 실험 회전 속도가 빠르다.
  intent+slot 구조를 빨리 붙여 볼 수 있다.
- 단점:
  grocery domain이 아니다.
  intent 종류가 음악, 날씨, 영화 등 voice assistant 전반이다.
- `jangoing`에서의 역할:
  MASSIVE보다 더 작은 **intent/slot modeling smoke set**
- 권장 사용:
  token classification head, BIO tagging, evaluation loop, ONNX export 전 검증
- 비권장 사용:
  grocery domain 성능 추정

### 3. `sonos-nlu-benchmark/snips_built_in_intents`

- 성격:
  아주 작은 intent classification benchmark
- 장점:
  모델 코드 smoke test에 가장 가볍다.
- 단점:
  너무 작고 grocery와 무관하다.
- `jangoing`에서의 역할:
  local baseline sanity check 정도

### 4. `empathyai/grocery-ner-dataset`

- 성격:
  grocery item/entity extraction 중심의 NER dataset
- 장점:
  `ITEM`, `CATEGORY` 같은 grocery surface extraction에 가장 직접 가깝다.
  synthetic보다 자연스러운 grocery vocabulary seed로 쓸 가능성이 높다.
- 단점:
  dataset의 entity taxonomy가 `jangoing` schema와 다를 수 있다.
  예를 들어 `fruits`, `vegetables`, `dairy`, `meat`처럼 더 세분되거나 다른
  기준의 entity class를 사용할 수 있다.
- `jangoing`에서의 역할:
  **slot/entity model bootstrap**과 **taxonomy expansion review source**
- 권장 사용:
  raw label을 바로 합치지 말고, 먼저 `ITEM/CATEGORY` 중심으로 재매핑 규칙을 만든다.

### 5. `AmirMohseni/GroceryList`

- 성격:
  grocery item과 category 중심의 소규모 분류성 데이터
- 장점:
  canonical item/category 사전 확장에 유용하다.
  synthetic taxonomy를 손으로만 늘리는 것보다 더 다양한 품목 seed를 줄 수 있다.
- 단점:
  utterance-level intent dataset이 아니다.
  phrase family, action intent, span supervision은 제공하지 않을 가능성이 높다.
- `jangoing`에서의 역할:
  **taxonomy seed**와 **normalized value candidate source**

### 6. `pfb30/multi_woz_v22`

- 성격:
  multi-turn task-oriented dialogue dataset
- 장점:
  clarification, slot carryover, follow-up, dialogue state tracking 같은 구조를
  설계할 때 참고 가치가 크다.
- 단점:
  grocery inventory domain이 아니다.
  MVP 단일 문장 parser/annotator에는 너무 무겁다.
- `jangoing`에서의 역할:
  **future multi-turn design reference**

### 7. `FunDialogues/customer-service-grocery-cashier`

- 성격:
  grocery store customer-service style dialogue
- 장점:
  grocery-domain conversation tone을 보는 데는 도움이 된다.
- 단점:
  `home inventory update`가 아니라 `store interaction`에 더 가깝다.
- `jangoing`에서의 역할:
  **surface-style inspiration only**

### 8. Instacart 계열 공개 데이터

- 예:
  `attik/Instacart-Market-Basket-Analysis`
- 성격:
  basket / order / co-purchase / reorder pattern 데이터
- 장점:
  item co-occurrence, reorder prior, “보통 같이 사는 것” 추천에 유용하다.
- 단점:
  utterance, intent, slot span이 없다.
  NLU 학습용이 아니라 behavioral/recommendation 데이터다.
- `jangoing`에서의 역할:
  **recommendation / shopping-list enrichment later**

## `jangoing` schema로의 매핑 전략

### A. 직접 매핑 가능한 것

- `grocery-ner-dataset`
  - 후보 매핑:
    `fruit`, `vegetable`, `dairy` 등 세부 타입 -> `ITEM` 또는 `CATEGORY`
  - 사용 위치:
    slot tagging bootstrap

- `GroceryList`
  - 후보 매핑:
    item name -> canonical `ITEM`
    item category -> canonical `CATEGORY`
  - 사용 위치:
    taxonomy review input

### B. 부분 매핑만 가능한 것

- `MASSIVE`
- `SNIPS`

이 둘은 대부분 `jangoing` intent와 1:1로 안 맞는다. 대신 다음처럼 쓴다.

- 공통 text encoder warm-up
- intent classifier / slot tagger code path smoke test
- OOD 처리 실험
- calibration, confidence threshold, fallback policy 실험

즉, label semantics를 섞지 말고 **모델 구조 검증용 별도 corpus**로 유지한다.

### C. 직접 매핑하면 안 되는 것

- Instacart
- product catalog / shopping search / ecommerce benchmark 계열

이들은 utterance NLU dataset이 아니라서 `annotations`나 `actions`로 직접 변환하면
데이터 의미가 무너진다.

## 실제 도입 순서

### Step 1. 지금 바로

1. `synthetic-v1`
2. production `/annotate`
3. human-reviewed `generated_review`, `correction`, `confirmed`, `expiry`

이 세 축이 현재 주 데이터 소스다.

### Step 2. 가장 먼저 추가 검토

1. `GroceryList`
2. `grocery-ner-dataset`

이 둘은 grocery domain 적합성이 높아서 `taxonomy 확장`과 `slot labeling reference`
에 직접 도움 된다.

### Step 3. 모델 파이프라인 보강

1. `SNIPS`
2. `MASSIVE`

이 둘은 domain fit보다 **모델링 파이프라인 검증** 가치가 높다.

### Step 4. 나중에

1. `MultiWOZ`
2. Instacart

이 둘은 각각 multi-turn 설계와 추천/장바구니 enrichment에 쓰는 것이 맞다.

## 추천 도입 방식

### 1. 공개셋 원본을 바로 training data에 합치지 않는다

원본 label 체계가 `jangoing`와 다르기 때문이다. 먼저 source별로 분리한다.

- `source = external_massive`
- `source = external_snips`
- `source = external_grocery_ner`
- `source = external_grocery_taxonomy`

이런 식으로 provenance를 명시해야 한다.

### 2. 변환 결과도 원본과 분리 저장한다

예:

```text
data/external/massive/raw/
data/external/massive/mapped/
data/external/grocery_ner/raw/
data/external/grocery_ner/mapped/
```

원본을 덮어쓰면 나중에 mapping 오류를 추적하기 어렵다.

### 3. `annotation-v2` 정답 체계에 맞지 않으면 강제 변환하지 않는다

예를 들어:

- phrase family가 없으면 비워 둔다.
- intent가 애매하면 training set에 섞지 말고 review queue 후보로 둔다.
- multi-turn context가 필요한 예시는 현재 single-turn dataset으로 강제 축소하지 않는다.

## 첫 구현 제안

가장 실용적인 다음 작업은 이 순서다.

1. `GroceryList`를 읽어 canonical item/category 후보 CSV 또는 JSON으로 정리
2. 현재 `ml/taxonomy/grocery-v1.json`과 diff 비교
3. `grocery-ner-dataset` label set 조사
4. `ITEM/CATEGORY` 매핑 표 작성
5. 그 후에만 import script를 만든다

`MASSIVE`와 `SNIPS`는 vocabulary import가 아니라 model experiment track으로 다루는
편이 낫다.

Open Food Facts는 같은 원칙으로 다루되 규모와 product-record 중복을 고려해 별도
catalog track으로 관리한다. 브랜드, alias, category 후보로 사용하는 방법과
`grocery-v2` 선행 조건은
[OPEN_FOOD_FACTS_BRAND_STRATEGY.md](./OPEN_FOOD_FACTS_BRAND_STRATEGY.md)에
정리되어 있다.

## synthetic-v1 확장과의 관계

이번 synthetic 확장은 공개셋이 아직 직접 연결되지 않은 상태에서, 내부 bootstrap
coverage를 먼저 넓히기 위한 조치다.

- 기존 문제:
  item 종류가 너무 적어서 generator가 늘 비슷한 품목만 반복했다.
- 바꾼 점:
  canonical item을 33개로 늘리고, alias surface도 고정 1개가 아니라 순환 사용했다.
- 효과:
  `generated_review`에서 annotator가 보는 문장이 더 다양한 item surface를 포함하게
  되었고, baseline이 item lexical diversity를 더 많이 보게 되었다.

즉, 공개셋 도입 전 단계에서 synthetic의 약한 부분을 먼저 보강한 것이다.

## 주의점

- 공개셋이 open-source라고 해서 곧바로 production-like data가 되는 것은 아니다.
- license, annotation quality, schema mismatch를 반드시 확인해야 한다.
- 특히 intent semantics가 다른 assistant dataset은 `label leakage`보다
  `label distortion`이 더 큰 위험이다.

최종 기준은 여전히 `jangoing` human-reviewed production annotation이다.
