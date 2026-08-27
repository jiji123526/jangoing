# synthetic-v1 데이터 생성 및 의사결정 기록

## 결정 요약

- 결정일: 2026-08-26
- 첫 데이터 언어: 영어
- 다국어 준비: `language`, `locale`, 언어별 taxonomy alias를 처음부터 포함
- 데이터 수: 800개
- intent: 8개, 각 100개로 균형 구성
- 용도: 첫 학습 bootstrap 및 파이프라인 검증
- 금지 용도: 최종 실제 사용자 성능을 주장하는 test set

## 선택한 intent

```text
add_item
consume_item
mark_low
throw_away
add_to_buy
query_inventory
unknown
needs_clarification
```

`unknown`과 `needs_clarification`을 분리했다. `unknown`은 관련 행동이 없는
문장이고, `needs_clarification`은 관련 요청일 가능성은 있지만 안전한 행동을
결정할 정보가 부족한 문장이다.

예:

```text
I like coffee                 -> unknown
We're out of drinks           -> needs_clarification
Put that on the list          -> needs_clarification
```

이 구분을 선택한 이유는 모호한 요청을 단순 실패로 버리지 않고, 질문해야 하는
상황으로 학습·평가하기 위해서다.

## 영어부터 시작한 이유

현재 앱과 기존 파서가 영어 중심이고 한 언어에서 데이터·분할·평가 오류를 먼저
발견하는 편이 단순하다. 대신 한국어 추가 시 구조를 다시 만들지 않도록 모든
record에 다음 필드를 포함했다.

```json
{
  "language": "en",
  "locale": "en-US",
  "intent": "mark_low",
  "normalized": {"item_name": "milk"}
}
```

taxonomy는 canonical ID와 언어별 alias를 분리한다.

```json
{
  "id": "milk",
  "aliases": {
    "en": ["milk"],
    "ko": ["우유"]
  }
}
```

한국어 단계에서는 generator, 실제 검토 데이터, alias, 언어별 평가 slice를
추가하면 된다. 영어 TF-IDF 모델이 한국어를 자동으로 이해하는 것은 아니므로
한국어 모델 또는 multilingual model 비교는 별도 실험으로 진행한다.

## 생성 방식

재현 가능한 결정론적 generator를 사용했다.

- generator: `ml/data_generation/generate_synthetic.py`
- scenarios: `ml/data_generation/scenarios-v1.json`
- taxonomy: `ml/taxonomy/grocery-v1.json`
- seed: `20260826`
- dataset: `ml/datasets/synthetic-v1.jsonl`
- manifest: `ml/manifests/synthetic-v1.json`

동일한 코드, taxonomy, scenarios, seed를 사용하면 같은 문장과 라벨을 생성한다.
생성 결과 hash는 manifest에 기록한다.

## record 구조

각 record에는 다음이 포함된다.

- 원문과 언어/locale
- intent
- 원문 entity span
- normalized canonical value
- phrase family
- 난이도
- clarification 필요 여부
- source와 generator/taxonomy version
- category/item 등 평가 tag

예시:

```json
{
  "text": "We're low on drinks",
  "language": "en",
  "locale": "en-US",
  "intent": "mark_low",
  "entities": [
    {"label": "CATEGORY", "start": 13, "end": 19, "text": "drinks"}
  ],
  "normalized": {"category": "beverage"},
  "phrase_family": "mark_low:template-06",
  "source": "synthetic"
}
```

## 자동 검증 결과

- 총 record: 800
- intent별 record: 100
- 중복 문장: 0
- 잘못된 entity span: 0
- language: 전부 `en`
- locale: 전부 `en-US`

generator 자체 검증과 `ml/tests/test_synthetic_dataset.py`를 모두 사용한다.

## 데이터 분할

행 단위 무작위 분할 대신 intent별 phrase-family grouped split을 사용한다.

- train: intent마다 7개 표현군
- validation: intent마다 2개 표현군
- test: intent마다 1개 표현군
- 예상 record 수: train 560, validation 160, test 80

같은 템플릿의 상품명만 바꾼 문장이 여러 split에 섞이지 않는다. 또한 각 split에
모든 intent가 포함되도록 intent별로 그룹을 나눈다.

## 첫 baseline 결과

TF-IDF + Logistic Regression을 synthetic-v1의 grouped holdout에 실행한 smoke
결과 Macro-F1은 `0.1875`였다.

이 점수가 낮은 이유는 test 표현군을 train에서 완전히 제외했고 TF-IDF가 보지
못한 표현에 약하기 때문이다. 이는 실패가 아니라 첫 비교 기준점이다. 향후
데이터와 모델이 실제로 새로운 표현에 일반화하는지 비교하는 출발점으로 사용한다.

이 점수로 실제 사용자 성능을 주장하면 안 된다. synthetic 문장을 생성한 규칙과
평가 문장 생성 규칙이 서로 연관돼 있고 실제 대화 분포를 대표하지 않기 때문이다.

## 검토한 다른 선택지

### 생성 데이터 없이 실제 데이터만 수집

가장 현실적인 데이터지만 첫 모델과 파이프라인 검증까지 시간이 오래 걸린다.
synthetic 데이터로 기술적 오류를 먼저 찾고, 최종 test는 실제 데이터로 만드는
혼합 방식을 선택했다.

### LLM 호출로 매번 자유 생성

표현 다양성은 높을 수 있지만 모델 버전, prompt, temperature에 따라 결과가
달라지고 비용과 재현성 문제가 생긴다. v1은 고정 scenarios와 seed를 사용했다.
향후 LLM 생성 데이터를 추가할 경우 provider/model/prompt/temperature와 원본
응답 hash를 manifest에 반드시 기록한다.

### 기존 7개 intent만 유지

모호한 요청이 `unknown`에 섞이면 관련 없는 대화와 질문이 필요한 요청을 구분할
수 없다. 따라서 `needs_clarification`을 별도 intent로 추가했다.

### 영어와 한국어를 동시에 생성

초기 디버깅과 평가 변수가 늘어난다. 영어로 학습 루프를 안정화하되 스키마와
taxonomy는 처음부터 다국어 확장형으로 만드는 방식을 선택했다.

## 현재 한계

- 문장은 사람이 실제 앱에서 말한 문장이 아니라 generator가 만든 문장이다.
- taxonomy는 초기 소규모 목록이며 정식 식품 ontology가 아니다.
- phrase family는 scenario template 기반이다.
- category resolver는 아직 production parser에 연결되지 않았다.
- 일반 correction UI와 별도로 production `/annotate` 화면에서 span 라벨링을 지원한다.
- baseline은 intent만 학습하며 entities와 normalized 값은 사용하지 않는다.
- baseline은 single-intent 전용이며 annotation-v2 multi-action record는 첫 intent로
  축약하지 않고 제외 개수를 metrics에 기록한다.
- 실제 frozen test set은 아직 없다.

## 실행 방법

데이터 재생성:

```bash
source ml/.venv/bin/activate
python ml/data_generation/generate_synthetic.py
```

검증:

```bash
pytest ml/tests
```

baseline 학습:

```bash
python ml/train_baseline.py ml/datasets/synthetic-v1.jsonl \
  --output ml/artifacts/synthetic-v1-baseline
```

## 다음 결정 지점

다음 항목은 자동으로 선택하지 않고 데이터 수집 결과를 본 뒤 결정한다.

1. 한국어를 별도 모델로 학습할지 multilingual model로 합칠지
2. taxonomy를 직접 관리할지 외부 표준 식품 taxonomy를 도입할지
3. LLM 생성 데이터를 v2에 섞을지
4. DistilBERT가 TF-IDF보다 충분히 개선됐다고 판단할 승격 기준
5. production 원문 데이터의 보존 기간과 비식별화 정책

최종 모델 비교는 synthetic test가 아니라 사람이 작성하고 검토한 frozen test
set에서 수행한다.

## 현재 human data 연결 계획

- `synthetic-v1` 800개: 첫 training bootstrap과 파이프라인 검증
- `/annotate` training candidates 100~200개: 사람이 검토한 실제 표현 보강
- `/annotate` evaluation candidates 100개 이상: 독립 validation/test 후보
- evaluation 후보는 중복 제거와 phrase-family grouped review 후에만 frozen test가 된다.
- multi-action record는 구조를 그대로 보존하고 별도 baseline이 생길 때까지 현재
  single-intent 학습에서 제외한다.
