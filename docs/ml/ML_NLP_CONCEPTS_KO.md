# jangoing 머신러닝·언어학 개념 안내서

## 1. 문서 목적

이 문서는 jangoing을 개발하면서 등장하는 머신러닝, 자연어 처리, 언어학,
데이터 평가, 추천 시스템 개념을 프로젝트 예시로 설명한다. 수식보다 각 개념이
왜 필요하고 코드와 제품에서 어떤 역할을 하는지 이해하는 데 초점을 둔다.

현재 구현된 개념과 향후 계획인 개념을 구분한다.

- **현재 적용**: 규칙 기반 파서, intent/slot 구조, inference logging,
  synthetic data, TF-IDF, Logistic Regression, grouped split, 기본 평가
- **향후 적용**: Transformer, token classification, context retrieval,
  calibration, multilingual model, recommendation ranking, online evaluation

## 2. 전체 문제 정의

jangoing의 언어 시스템은 문장을 보고 다음 질문에 답해야 한다.

```text
1. 사용자가 주방과 관련된 요청을 했는가?
2. 어떤 행동을 원하는가?
3. 행동에 필요한 상품, 수량, 위치, 날짜는 무엇인가?
4. 표현이 모호해 질문이 필요한가?
5. 앞선 대화와 재고 상태 중 어떤 컨텍스트가 필요한가?
6. 행동을 실행할지, 정보를 답할지, 추천할지 결정할 수 있는가?
```

예:

```text
"We're almost out of milk"
```

```json
{
  "intent": "mark_low",
  "entities": [
    {"label": "ITEM", "text": "milk"}
  ],
  "normalized": {
    "item_name": "milk"
  }
}
```

반면 다음 문장은 현재 재고가 0이라는 상태를 직접 보고한다.

```text
"We're out of drinks"
```

```json
{
  "intent": "mark_out",
  "entities": [
    {"label": "CATEGORY", "text": "drinks"}
  ],
  "normalized": {
    "category": "beverage"
  }
}
```

## 3. 규칙 기반 시스템과 머신러닝

### 규칙 기반 파서

사람이 문장 패턴을 직접 작성하는 방식이다.

```text
low on {item}       -> mark_low
throw away {item}   -> throw_away
do we have {item}   -> query_inventory
```

현재 production 해석은 이 방식으로 동작한다.

장점:

- 학습 데이터 없이 시작할 수 있다.
- 결과가 결정적이고 빠르다.
- 어떤 규칙이 결과를 만들었는지 설명하기 쉽다.

단점:

- 작성하지 않은 표현에 약하다.
- 동의어와 간접적인 문장을 계속 수동으로 추가해야 한다.
- 다중 턴 대화와 복잡한 컨텍스트를 일반화하기 어렵다.

### 머신러닝 모델

사람이 규칙을 직접 모두 작성하는 대신, 입력과 정답 예시에서 통계적 패턴을
학습한다.

```text
"We barely have any milk left" -> mark_low
"The juice is almost gone"     -> mark_low
"Get more coffee next time"    -> add_to_buy
```

모델은 학습 예시를 이용해 처음 보는 문장의 intent를 예측한다. 하지만 데이터의
편향과 오류도 함께 학습하므로 검토 데이터와 정직한 평가가 필요하다.

### Baseline

새 모델의 개선 여부를 판단하기 위한 기준 모델이다. jangoing의 첫 baseline은
TF-IDF + Logistic Regression이다.

복잡한 모델은 baseline보다 정확도, latency, 비용, 안정성 중 의미 있는 개선을
보여야 도입할 근거가 생긴다.

## 4. 지도학습과 라벨

### 지도학습

입력과 정답이 함께 있는 데이터로 모델을 학습하는 방식이다.

```json
{
  "text": "Please add milk to the shopping list",
  "intent": "add_to_buy"
}
```

여기서 `text`가 입력이고 `intent`가 label 또는 target이다.

### Label

모델이 맞혀야 하는 정답이다. intent label과 entity label이 있다.

```text
Intent label: add_to_buy
Entity label: ITEM
```

라벨 정의가 일관되지 않으면 모델이 학습할 수 없다. 예를 들어 같은 종류의
문장을 어떤 사람은 `mark_low`, 다른 사람은 `add_to_buy`로 기록하면 이를
annotation disagreement라고 볼 수 있다.

### Human-in-the-loop

시스템이 먼저 예측하고 사람이 확인하거나 수정하는 방식이다.

```text
파서 예측 -> 사용자 검토 -> 정답 저장 -> 다음 모델 학습
```

현재 correction UI와 inference log가 이 학습 루프의 기반이다.

## 5. Intent classification

### Intent

문장 전체가 표현하는 사용자의 목적 또는 행동이다.

현재 intent:

- `add_item`: 재고 추가
- `update_expiry`: 기존 재고의 유통기한 추가 또는 수정
- `consume_item`: 사용 또는 소비
- `mark_low`: 부족 상태 표시
- `mark_out`: 재고 0 상태 표시
- `throw_away`: 폐기
- `add_to_buy`: 쇼핑 목록 추가
- `query_inventory`: 재고 질문
- `needs_clarification`: 관련 요청이지만 명확화 필요
- `unknown`: 지원하는 요청이 아님

### Classification

여러 label 중 하나를 선택하는 문제다.

```text
입력 문장 -> [intent별 점수] -> 가장 적절한 intent
```

`unknown`과 `needs_clarification`은 안전성에 중요하다. 모델이 이해하지 못한
문장을 억지로 상태 변경 intent로 분류하는 false accept를 줄여야 한다.

### Multi-class와 multi-label

현재 TF-IDF baseline은 한 문장에 하나를 선택하는 multi-class 문제다. 하지만
현재 `annotation-v3`는 다음과 같은 문장을 여러 action으로 저장한다.

```text
"We finished the milk, so add it to the shopping list"
```

각 action은 자체 intent, phrase family, entities, normalized 값을 갖는다. 현재
single-intent baseline은 이런 record를 첫 intent로 축약하지 않고 학습에서 제외하며
제외 개수를 기록한다. 충분한 데이터가 모이면 multi-label classification만으로 끝낼지,
intent와 entity 연결까지 예측하는 structured prediction을 사용할지 비교한다.

## 6. Slot filling과 entity extraction

### Slot

행동을 실행하는 데 필요한 구조화된 값이다.

```text
item_name
quantity
unit
location
expiration_date
category
```

### Entity

원문에서 의미 있는 구간이다.

```text
"Add two cartons of milk"
     ^^^ QUANTITY
         ^^^^^^^ UNIT
                    ^^^^ ITEM
```

### Span

entity가 원문에서 차지하는 문자 시작과 끝 위치다.

```json
{
  "label": "ITEM",
  "start": 19,
  "end": 23,
  "text": "milk"
}
```

Python과 JavaScript의 일반적인 slice 규칙에서 `start`는 포함하고 `end`는
포함하지 않는다.

### BIO tagging

문장을 token 단위로 나눈 뒤 entity의 시작과 내부를 표시하는 방법이다.

```text
Add       O
two       B-QUANTITY
cartons   B-UNIT
of        O
milk      B-ITEM
```

여러 token으로 된 entity는 다음처럼 표시한다.

```text
next      B-EXPIRY_DATE
Friday    I-EXPIRY_DATE
```

- `B`: entity 시작
- `I`: 같은 entity 내부
- `O`: entity가 아님

향후 Transformer token classification slot 모델에서 사용할 수 있다.

## 7. Tokenization

문장을 모델이 처리할 수 있는 작은 단위로 나누는 과정이다.

단어 기반 예:

```text
"We're out of milk"
-> ["We're", "out", "of", "milk"]
```

Transformer는 보통 subword tokenizer를 사용한다. 처음 보는 단어도 더 작은
조각으로 나눌 수 있다.

```text
"yogurts" -> ["yogurt", "s"]
```

한국어에서는 조사와 어미, 띄어쓰기 편차 때문에 tokenization 특성이 영어와
다르다. 다국어 모델을 평가할 때 언어별 entity span과 token alignment를 별도로
확인해야 한다.

## 8. Normalization과 canonicalization

### Surface form

사용자가 실제로 말한 표현이다.

```text
eggs
drinks
two
next Friday
```

### Normalized value

시스템이 사용하는 표준 값이다.

```text
eggs            -> egg
drinks          -> beverage
two             -> 2
next Friday     -> 2026-08-28 (기준 날짜가 2026-08-26인 경우)
```

### Canonical ID

언어나 별칭이 달라도 같은 개념을 가리키는 내부 ID다.

```text
milk  -> milk
우유   -> milk
```

원문 span과 normalized 값을 분리해야 entity 추출 오류와 normalization 오류를
따로 측정할 수 있다.

### Deterministic normalizer

날짜 계산, 수량 변환, 단위 통일은 모델이 추측하기보다 명시적인 프로그램으로
처리하는 편이 안전한 경우가 많다.

```text
모델: "next Friday"라는 span을 찾음
날짜 normalizer: 기준 날짜와 timezone으로 ISO 날짜 계산
```

## 9. Taxonomy와 ontology

### Taxonomy

개념을 계층적으로 분류하는 구조다.

```text
beverage
├── water
├── milk
├── juice
├── tea
└── coffee
```

현재 `grocery-v1`은 작은 초기 taxonomy다.

### Ontology

분류뿐 아니라 개념 사이의 다양한 관계와 제약을 표현한다.

```text
milk is-a dairy product
milk may-contain allergen dairy
oat milk substitutes-for milk
```

추천과 안전 제약이 복잡해지면 단순 taxonomy보다 풍부한 ontology가 필요할 수
있다.

### Entity linking

원문 표현을 canonical entity 또는 category에 연결하는 과정이다.

```text
"drinks" -> category: beverage
"coke"   -> product/brand candidate
```

후보가 여러 개거나 confidence가 낮으면 명확화 질문을 해야 한다.

## 10. Ambiguity와 화용론

### Ambiguity

한 표현이 여러 의미를 가질 수 있는 현상이다.

```text
"Add milk"
```

가능한 해석:

- 현재 재고에 우유를 추가
- 쇼핑 목록에 우유를 추가

### Pragmatics, 화용론

문장의 사전적 의미뿐 아니라 상황과 의도를 이용해 실제 의미를 해석하는 분야다.

```text
"There's no milk"
```

문법적으로는 상태 설명이지만 상황에 따라 다음 의미가 될 수 있다.

- 재고가 없다는 정보
- 쇼핑 목록에 추가하라는 간접 요청
- 우유가 필요한지 묻는 대화의 시작

### Speech act, 발화행위

말로 수행하는 행동이다.

- assertion: 상태 설명
- request: 요청
- question: 질문
- recommendation request: 추천 요청
- confirmation: 확인

같은 단어를 사용해도 speech act가 다르면 시스템 행동이 달라진다.

### Implicature, 함축

직접 말하지 않았지만 대화 상황에서 추론되는 의미다.

```text
"I was going to make cereal, but there's no milk"
```

사용자가 쇼핑 목록 추가를 직접 말하지 않았어도 부족 상태나 대체품 추천이
관련될 수 있다. 함축을 근거 없이 자동 실행으로 바꾸면 위험하므로 확인 또는
명확화가 필요하다.

## 11. Context와 discourse

### Context

현재 문장을 이해하는 데 필요한 주변 정보다.

- 최근 대화
- 현재 재고와 유통기한
- 사용자 선호와 알레르기
- 식단 목표
- 예산과 위치
- 현재 시간과 timezone

### Discourse, 담화

여러 문장이 연결돼 의미를 만드는 구조다.

```text
User: Do we have juice?
System: No, it looks like we're out.
User: Add it to the list.
```

마지막 문장의 `it`이 juice를 가리킨다는 것을 앞선 담화에서 찾아야 한다.

### Coreference resolution, 상호참조 해결

`it`, `that`, `the usual one` 같은 표현이 무엇을 가리키는지 찾는 문제다.

```text
"We finished the milk. Add it to the list."
                             ^^ milk
```

### Context retrieval

모든 과거 정보를 모델에 넣지 않고 현재 요청과 관련 있는 정보만 찾는 과정이다.
정확도, 비용, 개인정보를 위해 관련 컨텍스트만 선택해야 한다.

### Context window

모델이 한 번에 볼 수 있는 입력 범위다. 범위가 커도 관련 없는 오래된 정보가
많으면 오히려 판단을 방해할 수 있다.

## 12. TF-IDF

TF-IDF는 문장을 단어와 단어 조합의 숫자 벡터로 바꾸는 방법이다.

### Term Frequency

한 문서에서 특정 단어가 얼마나 등장하는지 나타낸다.

### Inverse Document Frequency

모든 문서에 흔하게 나오는 단어의 중요도를 낮추고, 일부 문서에서 특징적으로
나오는 단어의 중요도를 높인다.

```text
"low on"       -> mark_low 구분에 유용
"shopping list" -> add_to_buy 구분에 유용
```

현재 baseline은 unigram과 bigram을 사용한다.

- unigram: `low`, `milk`
- bigram: `low on`, `shopping list`

TF-IDF는 문장 순서와 깊은 의미를 충분히 이해하지 못하지만 빠르고 해석 가능한
첫 기준점이다.

## 13. Logistic Regression

이름에 regression이 있지만 classification에도 널리 사용하는 선형 모델이다.
TF-IDF 벡터를 입력받아 intent별 점수를 계산한다.

```text
P(mark_low | sentence)
P(add_to_buy | sentence)
P(unknown | sentence)
...
```

현재 baseline에서는 class imbalance를 완화하기 위해 class weight를 사용하고,
재현성을 위해 random seed를 고정한다.

선형 모델이므로 특정 단어와 bigram이 각 intent에 미치는 영향을 비교적 쉽게
확인할 수 있다.

## 14. Transformer와 DistilBERT

### Transformer

문장 안의 단어가 서로 어떤 관계를 갖는지 attention을 이용해 표현하는 신경망
구조다. TF-IDF보다 문맥과 단어 순서를 풍부하게 처리할 수 있다.

### Attention

현재 token을 해석할 때 다른 token 중 무엇을 얼마나 참고할지 학습하는 방식이다.

```text
"Add it to the shopping list"
```

`it`을 이해하려면 앞선 문장이나 관련 entity에 주의를 기울여야 한다.

### Pretraining과 fine-tuning

- pretraining: 대규모 일반 텍스트에서 언어 패턴을 미리 학습
- fine-tuning: jangoing의 intent/slot 데이터로 목적에 맞게 추가 학습

### DistilBERT

BERT를 더 작고 빠르게 만든 Transformer 계열 모델이다. 향후 intent 및 slot
baseline 후보지만 아직 production에 적용되지 않았다.

도입 전 TF-IDF와 동일한 실제 frozen test set에서 정확도와 latency를 비교해야
한다.

## 15. Synthetic data

사람이 실제로 입력한 데이터가 아니라 규칙이나 생성 모델로 만든 데이터다.

현재 `synthetic-v1`은 고정 scenarios, taxonomy, seed를 이용해 만든 영어 800개
데이터다.

장점:

- 빠르게 class 균형을 맞출 수 있다.
- 희귀 상황과 모호한 표현을 의도적으로 포함할 수 있다.
- span과 normalized 정답을 생성 시점에 함께 만들 수 있다.
- 파이프라인을 실제 데이터 전에 검증할 수 있다.

위험:

- 실제 사용자 표현 분포와 다를 수 있다.
- 생성 규칙의 말투를 모델이 외울 수 있다.
- synthetic test 점수가 실제 성능처럼 보일 수 있다.

따라서 bootstrap train에는 사용할 수 있지만 최종 test는 실제 사람이 작성하고
검토한 frozen 데이터로 구성해야 한다.

## 16. Dataset split과 leakage

### Train set

모델의 parameter를 학습하는 데이터다.

### Validation set

모델과 hyperparameter를 선택하는 데이터다.

### Test set

최종 성적표다. 모델 선택 과정에서 반복해서 보면 test에 과적합하게 되므로
마지막 비교에만 사용한다.

### Data leakage

학습할 때 알 수 없어야 하는 정보가 train에 들어가는 문제다.

예:

```text
Train: "We're out of milk"
Test:  "We're out of eggs"
```

상품명만 다른 동일 템플릿이면 test가 지나치게 쉬워진다.

### Phrase family grouped split

같은 표현 구조를 하나의 그룹으로 묶고 그룹 전체를 하나의 split에 넣는다.
현재 synthetic-v1은 intent별로 그룹을 나눠 모든 split에서 intent 균형도 유지한다.
실제 `/annotate` 데이터는 controlled semantic family를 사용한다. multi-action record는
action family 조합을 발화 전체 family로 보존해 거의 같은 복합 문장이 split 사이에
섞이지 않도록 해야 한다.

### Frozen test set

한 번 확정한 뒤 모델 개발 과정에서 수정하지 않는 test set이다. 실제 사용자
일반화를 측정하는 최종 기준으로 사용한다.

## 17. Overfitting, underfitting, generalization

### Overfitting, 과적합

학습 데이터를 외웠지만 새로운 데이터에는 약한 상태다.

```text
Train F1: 0.99
Test F1: 0.55
```

### Underfitting, 과소적합

모델이 너무 단순하거나 학습이 부족해 train과 test 모두 성능이 낮은 상태다.

### Generalization, 일반화

학습에서 보지 못한 표현, 상품, 브랜드, 대화에서도 올바르게 판단하는 능력이다.
jangoing에서 가장 중요한 목표 중 하나다.

평가 slice 예:

- 본 상품명과 처음 보는 상품명
- 직접 명령과 간접 요청
- exact item과 category
- 짧은 문장과 긴 대화
- 정상 텍스트와 ASR 오류
- single-turn과 multi-turn

## 18. Hyperparameter와 random seed

### Parameter

학습을 통해 모델이 얻는 값이다. Logistic Regression의 단어별 weight 등이
해당한다.

### Hyperparameter

학습 전에 사람이 정하는 설정이다.

- n-gram 범위
- regularization 강도
- learning rate
- batch size
- epoch 수

### Random seed

데이터 섞기와 초기화의 난수 출발점이다. 같은 실험을 재현하고 변동성을 비교하기
위해 기록한다. seed 하나의 결과만 절대적인 성능으로 해석해서는 안 된다.

## 19. 평가 지표

### Accuracy

전체 예측 중 맞은 비율이다. class가 불균형하면 오해를 일으킬 수 있다.

### Precision

모델이 특정 class라고 예측한 것 중 실제로 맞은 비율이다.

```text
Precision = TP / (TP + FP)
```

### Recall

실제 특정 class인 것 중 모델이 찾아낸 비율이다.

```text
Recall = TP / (TP + FN)
```

### F1

Precision과 Recall의 조화평균이다.

```text
F1 = 2 * Precision * Recall / (Precision + Recall)
```

### Macro-F1

각 intent의 F1을 동일한 비중으로 평균한다. 데이터가 많은 intent가 전체 점수를
지배하지 않게 하므로 주요 baseline 지표로 사용한다.

### Micro-F1

모든 예측의 TP, FP, FN을 합쳐 계산한다. 빈도가 높은 class의 영향이 크다.

### Confusion matrix

실제 label과 예측 label 조합을 표로 보여준다. 어떤 intent끼리 자주 혼동하는지
찾는 데 사용한다.

### Exact match

intent와 모든 slot이 전부 맞아야 성공으로 계산한다. 실제 행동이 정확한지 보는
엄격한 end-to-end 지표다.

### Entity-level F1

slot span의 label과 경계가 맞는지를 평가한다. token 몇 개만 맞은 결과를 완전한
entity 성공으로 과대평가하지 않게 한다.

## 20. Confidence와 calibration

### Confidence

모델이 자신의 예측에 부여하는 점수다. 높은 점수가 실제 높은 정확도를 보장하지
않는다.

### Calibration

confidence와 실제 정답률이 일치하는 정도다.

잘 calibration된 모델이 0.8 confidence를 준 사례 100개가 있다면 약 80개가
맞아야 한다.

### Confidence threshold

일정 점수 아래에서는 자동 행동 대신 `unknown` 또는 명확화 질문을 선택하는
경계다.

```text
높은 confidence + 안전한 정보 요청 -> 답변 가능
낮은 confidence                  -> clarification
상태 변경                         -> confidence와 무관하게 확인
```

향후 Expected Calibration Error와 reliability curve를 측정할 계획이다.

## 21. Offline과 online evaluation

### Offline evaluation

고정 데이터셋에서 모델을 평가한다.

- Macro-F1
- entity F1
- exact match
- calibration
- latency

빠르고 재현 가능하지만 실제 사용 행동을 모두 반영하지 못한다.

### Online evaluation

실제 제품에서 사용자 반응을 측정한다.

- 확인률
- 수정률
- 취소율
- 추천 수락률
- 목록 추가율
- 잘못된 행동 신고율

온라인 지표가 좋아도 안전성이나 사용자 목표를 해치는 방식으로 최적화하면 안
된다.

## 22. Drift

시간이 지나면서 실제 입력 분포가 학습 데이터와 달라지는 현상이다.

예:

- 새로운 브랜드 등장
- 계절별 음식 변화
- 사용자의 말투 변화
- 음성인식 엔진 변경

### Data drift

입력 데이터 분포가 달라지는 현상이다.

### Concept drift

같은 입력과 정답의 관계가 달라지는 현상이다.

모델 버전별 correction rate와 unknown 비율을 지속적으로 기록하면 drift 신호를
찾을 수 있다.

## 23. Versioning과 reproducibility

### Dataset version

어떤 데이터를 사용했는지 식별한다.

### Model version

어떤 학습 결과가 production에 사용됐는지 식별한다.

### Parser, normalizer, taxonomy version

모델 외의 규칙과 지식 구조도 결과에 영향을 주므로 함께 기록해야 한다.

### Dataset digest

데이터 전체에서 계산한 hash다. 같은 이름의 파일 내용이 바뀌었는지 확인한다.

### Reproducibility

코드, 데이터, seed, 환경을 이용해 같은 실험을 다시 실행할 수 있는 성질이다.

jangoing baseline은 Git commit, dataset hash, seed, Python version, split 개수를
metrics metadata에 기록한다.

## 24. Recommendation system 개념

### Candidate generation

추천 가능한 후보를 넓게 가져오는 단계다.

```text
재고, 유통기한, 쇼핑 목록, 식단 목표, 주변 딜 -> 후보 목록
```

### Filtering

알레르기, 식단 제한, 예산, 판매 종료, 재고 없음 같은 hard constraint에 어긋나는
후보를 제거한다.

### Ranking

남은 후보의 순서를 정한다.

```text
관련성 + 선호 + 가격 + 신선도 + 다양성 -> ranking score
```

### Rule-based recommender

사람이 정한 점수 규칙으로 순위를 만든다. 데이터가 적을 때 설명하기 쉬운 첫
baseline이 된다.

### Content-based recommendation

상품과 사용자 선호의 속성을 비교한다.

```text
고단백 선호 + 저당 목표 -> 조건에 맞는 상품 추천
```

### Collaborative filtering

비슷한 사용자들의 행동을 이용한다. 사용자 수가 적은 초기 단계에는 cold-start
문제가 크고 개인정보 고려가 필요하다.

### Learning to rank

클릭, 수락, 구매, 거절 같은 데이터로 후보 순서를 학습한다. 어떤 후보가
노출됐는지도 기록하지 않으면 position bias를 교정하기 어렵다.

### Cold start

신규 사용자나 신규 상품처럼 행동 데이터가 없는 상태다. 명시적 선호, 상품
metadata, 규칙 기반 추천으로 보완한다.

## 25. 추천 평가 지표

### Precision@K

상위 K개 추천 중 관련 있는 항목의 비율이다.

### Recall@K

관련 있는 전체 항목 중 상위 K개 안에 포함된 비율이다.

### NDCG@K

관련도가 높은 항목이 위에 배치됐는지 평가한다. 순서를 고려한다.

### Coverage

추천 시스템이 전체 catalog 중 얼마나 다양한 항목을 추천하는지 본다.

### Diversity와 novelty

비슷한 항목만 반복하지 않는지, 사용자가 아직 모를 만한 유용한 항목을 제시하는지
본다.

### Constraint violation rate

알레르기, 식단, 예산과 충돌하는 추천 비율이다. 정확도보다 우선하는 안전
지표가 될 수 있다.

### Deal freshness

추천한 가격 정보가 아직 유효한지 측정한다. 딜에는 출처, 관찰 시간, 만료 시간,
판매처, 단위 가격이 필요하다.

## 26. Bias와 안전

### Sampling bias

수집된 사용자가 전체 사용자를 대표하지 못하는 문제다.

### Label bias

라벨 작성자의 해석 습관이 정답에 반영되는 문제다.

### Position bias

상단에 보여서 선택된 것을 강한 선호로 오해하는 문제다.

### Automation bias

사용자가 시스템 제안을 과도하게 신뢰하는 현상이다. 상태 변경 전에 수정 가능한
확인 UI를 유지하는 이유다.

### Safety constraints

알레르기, 식이 제한, 건강 목표와 관련된 추천은 단순 engagement보다 안전을
우선해야 한다. 의료적 판단이 필요한 내용은 시스템 능력의 한계를 밝혀야 한다.

## 27. ASR과 음성 처리

### ASR

Automatic Speech Recognition, 음성을 텍스트로 바꾸는 기술이다.

```text
사용자 음성 -> ASR transcript -> intent/slot pipeline
```

ASR 오류는 NLP 모델 입력에 그대로 전달될 수 있다.

```text
"two cartons" -> "to cartons"
"juice"       -> "Jews"
```

따라서 평가 데이터에 ASR-like 오류를 포함하고, 가능하면 transcript뿐 아니라 ASR
confidence와 n-best 후보를 기록해야 한다.

### Wake word

음성 장치가 명령 수신을 시작하게 하는 특정 호출어다. Raspberry Pi 단계에서
고려할 개념이며 현재 구현되지 않았다.

## 28. 꼭 구분해야 하는 개념

### 예측과 정답

- prediction: 모델이 제안한 값
- label/ground truth: 사람이 검토한 정답

### 모델 성능과 제품 성능

- 모델 성능: F1, exact match, calibration
- 제품 성능: 수정률, 완료 시간, 사용자 만족, 오류 복구

### Synthetic test와 실제 test

- synthetic test: 파이프라인 smoke test와 초기 비교
- human frozen test: 실제 일반화 성능 판단

### Intent와 outcome

- intent: 사용자의 언어적 목적
- outcome: confirmed, corrected, cancelled처럼 제품에서 일어난 결과

### Entity span과 normalized value

- span: 원문에서 무엇을 말했는지
- normalized value: 시스템에서 어떤 표준 개념으로 사용할지

## 29. 현재 학습 순서

```text
1. 규칙 기반 parser를 초기 기준으로 사용
2. 사용자 prediction/correction/outcome 기록
3. synthetic-v1으로 파이프라인 검증
4. synthetic-v1으로 TF-IDF single-intent baseline artifact 확정
5. workflow pilot으로 reviewed train 300개, evaluation 100개 수집
6. 첫 human-data baseline으로 reviewed train 1,000개, evaluation 200개 확보
7. 중복·phrase-family leakage를 검토해 validation/frozen test 확정
8. relevance와 intent TF-IDF baseline을 각각 학습
9. English MVP용 reviewed train 3,000~5,000개, evaluation 500개 확보
10. DistilBERT relevance/intent 모델을 동일 frozen set에서 비교
11. 실제 span으로 token-classification slot 모델 구축
12. 모델 span과 deterministic normalizer를 hybrid pipeline으로 연결
13. shadow mode에서 production parser와 모델 prediction 비교
14. multi-action 데이터가 충분하면 structured prediction baseline 구축
15. context evaluation과 recommendation baseline 추가
```

생성 데이터와 AI draft는 사람이 확인하고 annotation으로 저장한 이후에만 reviewed
수량으로 계산한다.

## 30. 처음 모델을 만드는 사람을 위한 Jangoing 기술 사양

### 처음부터 언어 모델을 pretrain하지 않는다

Jangoing은 인터넷 규모의 텍스트로 새 언어 모델을 처음부터 만드는 프로젝트가
아니다. 먼저 단순한 TF-IDF 모델을 학습하고, 이후 이미 영어를 학습한
`distilbert-base-uncased`를 Jangoing annotation으로 fine-tuning한다.

```text
pretraining
= 일반 영어 자체를 대규모 데이터에서 학습

fine-tuning
= pretrained 모델을 Jangoing relevance, intent, entity task에 맞게 조정
```

수천 개 annotation으로 가능한 것은 fine-tuning이지 pretraining이 아니다.
OpenAI API는 annotation draft를 만드는 보조 기능이며 Jangoing 모델 학습에
필수적이지 않다.

### 권장 모델 분리

초기에는 하나의 복잡한 모델보다 다음 네 단계를 분리한다.

| 단계 | 입력 | 출력 | 초기 구현 | 이후 구현 |
|---|---|---|---|---|
| Relevance | 전체 발화 | 4개 relevance 중 하나 | TF-IDF + Logistic Regression | DistilBERT classification |
| Intent | actionable 발화 | 지원 intent 중 하나 | TF-IDF + Logistic Regression | DistilBERT classification |
| Entity/slot | actionable 발화 | 원문 entity span | 규칙/parser | DistilBERT token classification |
| Normalization | span + temporal context | canonical value | deterministic code | deterministic code 유지 |

Relevance label은 다음 네 개다.

```text
actionable
contextual_preference
domain_non_actionable
unrelated
```

Relevance와 intent를 별도 모델로 시작하면 non-actionable 문장이 inventory intent로
잘못 들어오는 원인과 intent 사이의 혼동을 따로 측정할 수 있다. shared encoder나
multi-task model은 각 baseline이 안정된 뒤 비교한다.

최종 hybrid pipeline은 다음과 같다.

```text
utterance
-> relevance classifier
-> intent classifier
-> entity token classifier
-> deterministic item/unit/quantity/date normalizers
-> schema validation
-> user confirmation
-> inventory event
```

상태를 바꾸는 action은 model confidence가 높아도 사용자 confirmation을 유지한다.

### Python과 라이브러리

현재 `ml/pyproject.toml`에 설치되는 최소 환경:

```text
Python >= 3.11
scikit-learn
joblib
pytest (dev dependency)
```

Transformer 학습 단계에서 추가할 후보:

```text
torch
transformers
datasets
evaluate
seqeval
accelerate
optimum
onnxruntime
```

- PyTorch: gradient 계산과 neural network 학습
- Transformers: pretrained DistilBERT, tokenizer, training utilities
- Datasets: JSONL loading, mapping, batching
- Evaluate: classification metric 계산
- seqeval: BIO entity span precision, recall, F1
- Accelerate: CPU, single GPU, multi-GPU 실행 차이 단순화
- Optimum/ONNX Runtime: ONNX export, optimization, inference

이 dependency들은 아직 repository에 추가되지 않았다. TF-IDF 실습에는 현재
dependency만으로 충분하다.

### Classification 모델의 입력과 출력

Relevance 또는 intent classifier는 tokenized sentence를 받아 class별 logit을
출력한다.

```text
input:
"We're out of milk"

intent logits:
add_item       -1.3
mark_low        0.4
mark_out        3.2
add_to_buy      0.1
...

softmax:
mark_out = 0.89
```

`logit`은 확률로 변환하기 전 점수다. `softmax`가 점수를 class별 확률처럼 보이는
값으로 바꾼다. 학습 중에는 prediction과 정답 사이의 cross-entropy loss를 줄이도록
weight를 수정한다. softmax 값이 실제 정확도와 일치하려면 별도 calibration 검사가
필요하다.

### Slot model의 입력과 출력

Slot model은 문장 하나에 label 하나를 주는 classification과 달리 각 token에 BIO
label을 예측한다.

```text
Add       O
two       B-QUANTITY
cartons   B-UNIT
of        O
oat       B-ITEM
milk      I-ITEM
next      B-EXPIRY_DATE
Friday    I-EXPIRY_DATE
```

DistilBERT tokenizer는 단어를 subword로 나눌 수 있으므로 annotation의 문자
`start/end`를 tokenizer offset 또는 `word_ids()`에 정렬해야 한다. special token,
padding, 정답을 줄 수 없는 subword 위치는 보통 loss에서 제외하도록 `-100`을
사용한다. 이 alignment가 잘못되면 모델 구조가 정상이어도 slot 정답이 깨진다.

모델은 `next Friday` span을 찾고, ISO 날짜 계산은 하지 않는다. 날짜는 원래
inference의 `reference_date + timezone`을 사용하는 shared deterministic
normalizer가 계산한다.

### DistilBERT 시작 hyperparameter

다음 값은 정답이 아니라 첫 reproducible experiment의 출발점이다.

| 설정 | Relevance/Intent 시작값 | Slot 시작값 |
|---|---:|---:|
| pretrained model | `distilbert-base-uncased` | `distilbert-base-uncased` |
| max sequence length | 128 | 128 |
| batch size | 16 | 8~16 |
| learning rate | `2e-5` | `3e-5` |
| epochs | 3~5 | 4~6 |
| weight decay | 0.01 | 0.01 |
| warmup ratio | 0.1 | 0.1 |
| random seed | 42 | 42 |
| model selection | validation macro-F1 | validation entity F1 |

실제 문장 길이의 95~99 percentile을 먼저 측정해 max length를 정한다. Jangoing
문장은 짧기 때문에 처음부터 512 token을 사용하면 memory와 latency만 낭비할
가능성이 높다. validation macro-F1이 개선되지 않으면 early stopping을 적용하고,
최종 수치는 여러 random seed에서 확인한다.

### 예상 하드웨어와 artifact

- TF-IDF baseline: 일반 laptop CPU와 4GB 수준 memory로 충분
- DistilBERT fine-tuning: 8GB 이상 NVIDIA GPU 권장
- 3,000~5,000개 짧은 문장: GPU에서는 보통 수 분~수십 분 범위
- CPU fine-tuning: 가능하지만 반복 실험에는 느릴 수 있음
- DistilBERT FP32 weight: 대략 250MB 수준
- INT8 ONNX weight: 대략 60~100MB 범위를 기대하되 실제 export 후 측정

시간과 memory는 batch size, sequence length, hardware에 따라 크게 달라진다.
Out-of-memory가 발생하면 batch size를 줄이고 gradient accumulation을 사용한다.
Raspberry Pi 배포 전에는 ONNX INT8 모델의 memory, p50/p95 latency, 정확도 감소를
실제 장치에서 측정한다.

### 지금 실행할 첫 실습

Human dataset을 기다리지 않고 synthetic-v1으로 전체 흐름을 연습할 수 있다.

```bash
cd /home/jjiwoo/.workspace/jangoing

python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -e './ml[dev]'

python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/first-baseline

pytest ml/tests
```

결과:

```text
ml/artifacts/first-baseline/model.joblib
ml/artifacts/first-baseline/metrics.json
```

`model.joblib`은 TF-IDF vectorizer와 Logistic Regression classifier를 함께 저장한
학습 artifact다. `metrics.json`에는 dataset hash, Git commit, seed, split 수,
class별 precision/recall/F1, confusion matrix, 제외된 multi-action 수가 들어간다.

첫 실습의 목적은 synthetic 점수를 production 성능으로 해석하는 것이 아니라 다음
흐름을 직접 확인하는 것이다.

```text
JSONL dataset
-> validation/split
-> vectorization
-> model.fit
-> model.predict
-> metrics
-> versioned artifact
```

### Human dataset이 충분해진 뒤

Production D1에서 reviewed task별 dataset을 export한다.

```bash
npm run dataset:export -- --remote --require-annotation \
  --task intent \
  --train-output ml/data/intent-train.jsonl \
  --evaluation-output ml/data/intent-evaluation.jsonl

npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/slots-train.jsonl \
  --evaluation-output ml/data/slots-evaluation.jsonl
```

Export 성공이 dataset freeze 완료를 의미하지는 않는다. class/entity 분포,
near duplicate, source 비율, normalized-value 오류를 audit하고 독립적인 실제 사용자
evaluation candidate를 다시 검수한 뒤 dataset hash와 split manifest를 고정한다.

### 현재 구현된 부분과 다음 구현

현재 구현:

- task별 reviewed JSONL export
- exact normalized-text와 phrase-family split leakage 거부
- TF-IDF single-intent training
- grouped internal train/validation/test split
- dataset digest, Git commit, seed, metrics, confusion matrix 기록
- multi-action record 제외 및 제외 수 기록

다음 구현:

- class, source, phrase family, entity span 분포 report
- near-duplicate와 template similarity 검사
- 별도 frozen evaluation 파일을 직접 받는 baseline trainer
- relevance TF-IDF trainer
- DistilBERT relevance/intent trainer
- character span을 BIO token label로 바꾸는 alignment pipeline
- DistilBERT slot trainer와 entity-level evaluation
- confidence calibration과 unknown threshold 선택
- ONNX export, quantization, Raspberry Pi benchmark
- production shadow inference와 model-version logging

현재 `ml/train_baseline.py`는 입력 dataset 하나를 내부에서 다시 나눈다. 따라서
export한 frozen evaluation 파일을 직접 평가하지 않는다. production model 비교
전에 `--train-dataset`과 `--evaluation-dataset`을 명시적으로 받도록 수정해야 한다.

Scikit-learn `joblib` artifact와 PyTorch checkpoint는 Cloudflare Worker에서 그대로
실행할 수 있다고 가정하면 안 된다. 학습과 offline 평가는 먼저 local에서 완료하고,
정확도와 latency가 확인된 다음 ONNX, Raspberry Pi local inference, 별도 inference
service 등 배포 위치를 결정한다.

## 31. 공식 학습 자료

권장 학습 순서는 Scikit-learn text tutorial, PyTorch basics, Hugging Face
fine-tuning, token classification, ONNX optimization 순서다.

- [Scikit-learn: Working With Text Data](https://scikit-learn.org/stable/tutorial/text_analytics/working_with_text_data.html)
- [PyTorch: Learn the Basics](https://pytorch.org/tutorials/beginner/basics/intro.html)
- [Hugging Face Course: Fine-tuning a Pretrained Model](https://huggingface.co/learn/llm-course/chapter3/1)
- [Hugging Face: Text Classification](https://huggingface.co/docs/transformers/tasks/sequence_classification)
- [Hugging Face: Token Classification](https://huggingface.co/docs/transformers/tasks/token_classification)
- [Hugging Face Datasets documentation](https://huggingface.co/docs/datasets/)
- [ONNX Runtime: Model Quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)

처음에는 Scikit-learn tutorial과 현재 `ml/train_baseline.py`를 이해하면 충분하다.
PyTorch와 DistilBERT는 baseline artifact와 `metrics.json`을 직접 만들어 보고
해석한 다음 진행한다.

## 32. 관련 문서

- [ACADEMIC_GOALS_AND_RESEARCH_APPROACH_KO.md](../decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH_KO.md): 학술 목표, 연구 질문, 방법론
- [IMPLEMENTATION_NOTES_KO.md](../decisions/IMPLEMENTATION_NOTES_KO.md): 구현 내용과 기술 선택
- [SYNTHETIC_V1_KO.md](./SYNTHETIC_V1_KO.md): synthetic-v1 생성 및 결정 기록
- [MODEL_EVALUATION.md](./MODEL_EVALUATION.md): 평가와 로깅 원칙
- [PLAN.md](../planning/PLAN.md): 전체 제품 및 모델 로드맵
- [ACTION_ITEMS.md](../planning/ACTION_ITEMS.md): annotation 규모와 실행 gate
- [ml/README.md](../../ml/README.md): 학습 명령과 환경 설정
- [ANNOTATION_GUIDE_KO.md](../annotation/ANNOTATION_GUIDE_KO.md): production annotation 화면 사용법
- [ANNOTATION_CONVENTIONS_KO.md](../annotation/ANNOTATION_CONVENTIONS_KO.md): annotation-v4 정답 결정 규칙

새로운 모델이나 언어 기능을 추가할 때는 이 문서에 개념과 프로젝트 내 역할을
추가하고, 실제 구현 여부를 명확히 표시한다.
