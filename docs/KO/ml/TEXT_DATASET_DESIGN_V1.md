# Text Dataset Design v1

## 목적

이 문서는 음성 입력을 추가하기 전에 Jangoing의 영어 text NLU를 학습·평가하기
위한 dataset 설계를 고정한다.

핵심 원칙은 다음과 같다.

```text
candidate != ground truth
human-reviewed annotation -> task-specific exports
generated data -> training bootstrap only
independent natural text -> frozen evaluation
```

하나의 reviewed corpus에서 relevance, intent, slot, joint task용 export를 각각
만든다. 음성 단계에서는 ASR transcript를 이 text pipeline에 연결하므로 먼저 text
오류를 독립적으로 측정할 수 있어야 한다.

## 1. 현재 보유한 데이터

### Repository candidate data

| Dataset | Records | 현재 용도 |
|---|---:|---|
| `synthetic-v1` | 800 | actionable/clarification/legacy unknown 후보와 pipeline bootstrap |
| `relevance-candidates-v1` | 600 | non-actionable relevance 검수 후보 |
| 합계 | 1,400 | annotation candidate이며 reviewed ground truth가 아님 |

`relevance-candidates-v1` 구성은 다음과 같다.

| Candidate class | Records |
|---|---:|
| `contextual_preference` | 200 |
| `domain_non_actionable` | 300 |
| `unrelated` | 100 |

`synthetic-v1`은 8개 intent를 각 100개씩 포함한다.

```text
add_item
add_to_buy
consume_item
mark_low
needs_clarification
query_inventory
throw_away
unknown
```

### 현재 데이터의 중요한 gap

현재 contract는 11개 intent를 지원하지만 `synthetic-v1`에는 다음 세 intent가 없다.

```text
update_expiry
set_low_threshold
mark_out
```

추가로 다음 한계가 있다.

- 현재 annotation convention의 의미 기반 phrase family 대신
  `intent:template-N` family를 사용한다.
- `LOCATION`과 `EXPIRY_DATE` span이 없다.
- `QUANTITY`와 `UNIT` span은 각각 30개뿐이다.
- 모든 actionable 후보가 single-action이다.
- `unknown`의 일부 오래된 template는 현재 relevance-first convention에서
  non-actionable로 재분류될 수 있다.
- generated candidate의 label은 사람이 검수하기 전에는 정답이 아니다.
- production D1의 현재 reviewed 분포는 별도 snapshot이 필요하다.

따라서 1,400개를 그대로 학습 파일로 합치는 방식은 사용하지 않는다.

## 2. 학습 문제 분해

### Stage A: Relevance

모든 reviewed utterance를 네 class 중 하나로 분류한다.

```text
actionable
contextual_preference
domain_non_actionable
unrelated
```

이 단계는 grocery 단어가 있는지만 보는 domain detector가 아니다. 특히
`domain_non_actionable`을 충분히 넣어 action-like 단어가 있어도 실제 요청이 아닌
경우를 학습해야 한다.

### Stage B: Intent

`actionable` record만 사용한다.

```text
add_item
update_expiry
set_low_threshold
consume_item
mark_low
mark_out
throw_away
add_to_buy
query_inventory
needs_clarification
unknown
```

여기서 `unknown`은 선호나 unrelated 문장이 아니다. 의미는 명확하지만 현재
capability 밖인 `unsupported_request`다. 선호와 unrelated text는 Stage A에서
끝난다.

첫 TF-IDF baseline은 single-action record만 사용한다. Multi-action record를 첫
intent로 축약하지 않는다. 이후 multi-label 또는 structured action model에서
별도로 사용한다.

### Stage C: Entity span

Actionable record의 action별 span을 학습한다.

```text
ITEM
CATEGORY
QUANTITY
UNIT
LOCATION
EXPIRY_DATE
```

`ITEM_CONDITION`은 현재 legacy compatibility label이므로 신규 기본 수집 목표에서
제외한다. `out of`, `low`, `buy` 같은 action 표현은 entity가 아니라 intent를
결정하는 language evidence다.

### Stage D: Normalization

Span model과 normalization을 분리해 평가한다.

- `ITEM`, `CATEGORY`, `UNIT`, `LOCATION`: versioned taxonomy와 alias resolver
- `QUANTITY`: deterministic number parser
- `EXPIRY_DATE`: 저장된 `reference_date + timezone` 기반 deterministic normalizer
- 새 item: household-scoped value로 저장하고 provenance가 있는 catalog proposal 생성

Slot model이 span을 맞혔는데 resolver가 틀린 경우와, span 자체가 틀린 경우를 같은
오류로 합치지 않는다.

### Stage E: Joint action

최종 평가는 다음 구조 전체가 맞는지 확인한다.

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "entities": [
        {
          "label": "ITEM",
          "start": 16,
          "end": 20,
          "text": "milk",
          "normalized_value": "milk"
        }
      ],
      "phrase_family": "state_out_of_entity"
    }
  ]
}
```

## 3. First Human Baseline 목표

첫 정식 text baseline gate는 다음과 같다.

```text
training:   1,000 reviewed records
evaluation:   200 independently collected reviewed records
```

### Training relevance 분포

| Relevance | Target |
|---|---:|
| `actionable` | 710 |
| `contextual_preference` | 100 |
| `domain_non_actionable` | 150 |
| `unrelated` | 40 |
| 합계 | 1,000 |

`unrelated`보다 `domain_non_actionable`을 많이 둔다. 완전히 무관한 문장만 늘리면
모델이 grocery vocabulary 유무라는 쉬운 shortcut을 학습할 수 있기 때문이다.
학습 시 class weight와 macro-F1을 사용하므로 자연 분포를 무시한 25% 균등 구성을
강제하지 않는다.

### Actionable training intent 분포

아래 수치는 해당 intent를 포함하는 record의 최소 coverage다. Multi-action record는
여러 intent 행에 동시에 집계하지만, 전체 `actionable` record 목표 710개를 줄이지
않는다.

| Intent | Minimum records containing intent |
|---|---:|
| `add_item` | 80 |
| `update_expiry` | 60 |
| `set_low_threshold` | 50 |
| `consume_item` | 70 |
| `mark_low` | 70 |
| `mark_out` | 60 |
| `throw_away` | 60 |
| `add_to_buy` | 80 |
| `query_inventory` | 80 |
| `needs_clarification` | 60 |
| `unknown` | 40 |
| 최소 intent-bearing coverage | 710 |

이 수량은 최소 baseline 구성이다. 실제 오류율이 높은 intent에는 이후 correction과
low-confidence data를 더 배정한다.

### Evaluation 분포

200개 evaluation record는 generated template를 보고 바꿔 쓴 문장이 아니라
독립적으로 작성하거나 실제 사용에서 수집한 자연 text여야 한다.

| Relevance | Target |
|---|---:|
| `actionable` | 110 |
| `contextual_preference` | 25 |
| `domain_non_actionable` | 45 |
| `unrelated` | 20 |
| 합계 | 200 |

Actionable evaluation은 11개 intent별 최소 10개를 확보한다. Multi-action record는
여러 intent coverage에 기여할 수 있지만 evaluation 110개 목표를 대체하지 않는다.
이 정도는 안정적인 최종 성능 주장을 하기에는 작지만, 첫 per-intent 오류를 찾는
baseline으로는 사용할 수 있다.

## 4. Entity와 난이도 coverage

Training actionable corpus의 최소 span 목표:

| Entity | Minimum reviewed spans |
|---|---:|
| `ITEM` | 500 |
| `CATEGORY` | 100 |
| `QUANTITY` | 150 |
| `UNIT` | 120 |
| `LOCATION` | 80 |
| `EXPIRY_DATE` | 120 |

하나의 utterance가 여러 entity target에 동시에 기여할 수 있다. 수량을 채우기 위해
불필요한 entity를 표시해서는 안 된다.

추가 coverage:

- actionable training의 10-15%는 multi-action
- actionable evaluation의 최소 15%는 multi-action
- direct request와 indirect state report를 모두 포함
- item과 category mention을 분리
- seen item과 unseen item split을 별도 tag로 관리
- absolute date, relative date, weekday, correction 표현을 포함
- contraction, politeness, word-order variation, typo를 포함
- ASR-like text noise는 clean text와 별도 slice로 표시하고 첫 clean-text baseline에
  무분별하게 섞지 않음

## 5. 반드시 수집할 contrast set

비슷한 단어를 쓰지만 label이 달라지는 문장 묶음을 우선한다.

```text
We're low on milk.                 -> mark_low
We're out of milk.                 -> mark_out
Tell me when milk reaches one.     -> set_low_threshold
Add milk to the shopping list.     -> add_to_buy
Milk is expensive these days.      -> domain_non_actionable
I prefer oat milk.                 -> contextual_preference
```

```text
Add milk expiring Friday.          -> add_item
The milk expires Friday.           -> update_expiry
When does the milk expire?         -> query_inventory
Throw away the expired milk.       -> throw_away
```

```text
We finished the milk.              -> consume_item
We're out of milk.                 -> mark_out
Buy more milk.                     -> add_to_buy
```

이 contrast는 같은 lexical cue를 여러 label에 의도적으로 배치해 shortcut을 줄인다.
단, 한 묶음의 template variation을 train과 evaluation에 나누지 않는다.

## 6. Source별 역할

| Source | 기본 목적 | Evaluation 사용 |
|---|---|---|
| `generated_review` | coverage bootstrap과 rare intent 보강 | 금지 |
| `correction` | 실제 모델 오류를 보강 | 오류를 본 뒤 수집됐으므로 train 우선 |
| `low_confidence` | decision-boundary와 ambiguity 보강 | train 우선 |
| `expiry` | temporal span/normalization 보강 | train 우선 |
| `confirmed_unannotated` | 실제 사용 분포 복원 | 독립성 확인 후 일부 가능 |
| `evaluation_holdout` | 자연 표현의 frozen 후보 | 권장 |
| 직접 입력한 blind elicitation | 없는 class의 독립 표현 확보 | prompt wording을 노출하지 않았을 때 가능 |

외부 product dataset은 item, brand, alias, category catalog evidence로만 사용한다.
Open Food Facts product row를 자연어 action utterance처럼 취급하지 않는다.

## 7. Evaluation 수집 방식

Evaluation은 annotation 화면의 generated sentence를 단어만 바꾸어 만들지 않는다.
권장 순서는 다음과 같다.

1. 실제 앱 사용 중 자연스럽게 입력된 문장을 holdout 후보로 저장한다.
2. 부족한 intent는 의미 목표만 적힌 scenario card로 blind elicitation한다.
3. 가능하면 다른 작성자에게 example wording 없이 문장을 요청한다.
4. 모델 결과와 training error analysis를 보기 전에 `evaluation_candidate`로 지정한다.
5. annotation review, duplicate/near-duplicate 검사 후 freeze한다.

Scenario card에는 다음만 제공한다.

```text
goal: report that an existing item has no stock
required information: one grocery item
write it as you would naturally type to the app
```

`We're out of ...` 같은 목표 문장을 그대로 보여주지 않는다.

현재 schema는 `train_candidate`와 `evaluation_candidate`만 저장한다. 첫 200개
evaluation pool을 freeze할 때 phrase-family grouped rule로 development 100개와
final test 100개를 파생하고 manifest에 ID를 기록한다. Final test는 모델 선택과
threshold tuning에 사용하지 않는다.

## 8. Current candidate 사용 순서

### Phase 0: Production snapshot

먼저 D1의 reviewed count를 relevance, intent, purpose, source별로 집계한다.
이 환경에서는 `CLOUDFLARE_API_TOKEN`이 없어 remote snapshot을 실행하지 못했다.
인증된 개발 shell에서 snapshot을 만든 뒤 target과 차이를 계산한다.

### Phase 1: 400-record workflow pilot

- training 300
- independent evaluation candidates 100
- relevance candidate pilot: preference 40, domain non-actionable 60,
  unrelated 20
- 나머지 training은 actionable intent와 expiry gap을 우선

이 단계에서는 production model을 선택하지 않는다. annotation ambiguity, span,
normalization, temporal context, source metadata가 제대로 저장되는지 확인한다.

### Phase 2: Gap-targeted synthetic-v2

현재 1,400개를 단순 증식하지 않는다. 다음 gap만 겨냥해 약 400-600개의 candidate를
새로 만든다.

- `update_expiry`, `set_low_threshold`, `mark_out`
- `LOCATION`, `EXPIRY_DATE`, quantity/unit variation
- 현재 convention의 40개 의미 기반 phrase family
- `unknown > unsupported_request`
- 2-action과 3-action 문장
- 위의 contrast set
- product subtype, brand alias, category mention, unseen item

`synthetic-v2`는 v1 row를 조용히 바꾸지 않고 새 version, seed, manifest, hash를
가진다.

### Phase 3: First human baseline

- reviewed training 1,000개
- independent reviewed evaluation 200개
- TF-IDF relevance baseline
- TF-IDF single-intent baseline
- token-classification slot baseline
- deterministic normalization baseline
- joint exact-match evaluator

### Phase 4: Error-driven expansion

3,000-5,000 reviewed training record로 확장할 때는 균등 생성보다 frozen evaluation의
오류를 기준으로 correction, low-confidence, rare family를 추가한다. 같은 final test를
반복해서 보고 맞추지 않도록 development set과 final test를 분리한다.

## 9. Task export

동일한 reviewed annotation corpus에서 다음 파일을 만든다.

```text
relevance-train.jsonl
relevance-evaluation.jsonl

intent-train.jsonl
intent-evaluation.jsonl

slots-train.jsonl
slots-evaluation.jsonl

joint-train.jsonl
joint-evaluation.jsonl
```

현재 export 명령:

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task intent \
  --train-output ml/data/intent-train.jsonl \
  --evaluation-output ml/data/intent-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/slots-train.jsonl \
  --evaluation-output ml/data/slots-evaluation.jsonl

npm run dataset:export -- --remote --task joint \
  --train-output ml/data/joint-train.jsonl \
  --evaluation-output ml/data/joint-evaluation.jsonl
```

Production utterance export는 private local artifact이며 Git에 커밋하지 않는다.
Committed repository에는 generator, synthetic candidate, schema, manifest, aggregate
statistics만 둔다.

## 10. Freeze 전 quality gates

- annotation이 저장된 reviewed row만 ground truth로 사용
- exact duplicate와 normalized near-duplicate 검사
- phrase family가 train과 evaluation에 동시에 나오지 않음
- generated/real/elicited source별 분포 기록
- intent와 relevance class distribution 기록
- entity label별 span과 normalization 분포 기록
- 모든 entity span이 원문의 정확한 substring인지 확인
- relative date를 원래 `reference_date + timezone`으로 재검증
- multi-action을 single intent로 축약하지 않음
- item alias만 바꾼 template가 split을 넘지 않음
- annotation schema, taxonomy, normalizer version 기록
- dataset hash와 split ID manifest 저장
- evaluation의 development/test assignment를 freeze 후 변경하지 않음

## 11. 구현 gap

현재 infrastructure에서 dataset freeze 전에 추가해야 하는 작업:

1. Export record에 `inference_logs.source`와 language/locale provenance 보존
2. Reviewed distribution과 entity coverage report script
3. Near-duplicate 및 phrase-family leakage audit 강화
4. Evaluation pool을 development/final-test로 고정하는 split manifest 도구
5. Four-class relevance TF-IDF trainer
6. BIO token conversion과 slot baseline
7. Normalization accuracy와 joint exact-match evaluator
8. `synthetic-v2` targeted generator와 manifest

이 작업 전에도 annotation은 계속할 수 있다. 다만 frozen dataset이나 모델 성능을
발표하기 전에는 위 provenance와 split 도구가 필요하다.

## 결정

현재 데이터는 버리지 않지만 역할을 제한한다.

```text
synthetic-v1 + relevance-candidates-v1
-> candidate pool and bootstrap
-> human review
-> reviewed training corpus

independent natural text
-> human review
-> frozen development/test corpus
```

다음 구현 우선순위는 **production reviewed distribution report**와
**gap-targeted synthetic-v2 generator**다. 그 뒤 400-record workflow pilot을
완료하고 첫 1,000/200 text baseline으로 확장한다.
