# relevance-candidates-v1 생성 및 운영 기록

## 목적

`relevance-candidates-v1`은 relevance classifier를 바로 학습하는 ground-truth
dataset이 아니다. 사람이 production `/annotate`에서 검수할 문장을 제공하는
candidate dataset이다.

생성 label은 다음 용도로만 사용한다.

```text
generated relevance
-> request_context.candidate_relevance
-> annotation queue routing과 UI preselection
-> human review
-> annotations.relevance ground truth
```

## 구성

총 600개 영어 문장을 생성한다.

| Candidate relevance | 수량 | 목적 |
| --- | ---: | --- |
| `contextual_preference` | 200 | 선호, 식단, 목표, household context |
| `domain_non_actionable` | 300 | grocery vocabulary를 공유하는 hard negative |
| `unrelated` | 100 | 쉬운 outside-domain negative |

`actionable` 후보는 기존 `synthetic-v1`과 실제 correction/confirmed queue에서 이미
수집할 수 있으므로 이 파일에서 다시 생성하지 않는다. 이후 relevance model의 네
class 학습 데이터는 이 후보의 reviewed 결과와 기존 reviewed actionable annotation을
합쳐서 만든다.

## Phrase family

총 35개 family를 사용한다.

- `contextual_preference`: 10 families, family당 20개
- `domain_non_actionable`: 15 families, family당 20개
- `unrelated`: 10 families, family당 10개

주요 hard-negative family:

```text
price_observation
past_meal_report
recipe_instruction_quote
store_availability_report
product_comparison
nutrition_observation
cooking_process_report
future_meal_speculation
restaurant_experience
food_trend
seasonality_observation
package_observation
food_memory
social_food_report
general_food_question
```

예를 들어 `The recipe says to add ...`는 `add`라는 action-like 단어를 포함하지만,
사용자가 Jangoing에 inventory action을 요청한 것이 아니므로
`domain_non_actionable` candidate다. 이처럼 lexical shortcut을 어렵게 만드는 것이
완전히 unrelated한 문장을 많이 생성하는 것보다 중요하다.

## 파일

```text
ml/data_generation/generate_relevance_candidates.py
ml/data_generation/relevance-scenarios-v1.json
ml/datasets/relevance-candidates-v1.jsonl
ml/manifests/relevance-candidates-v1.json
ml/tests/test_relevance_candidates.py
```

generator는 seed `20260828`, `grocery-v1` taxonomy, scenario file을 사용한다.
같은 입력으로 생성한 JSONL payload는 같은 SHA-256을 가진다.

## 자동 검증

generator와 test는 다음을 확인한다.

- 정확히 600 records
- relevance별 `200 / 300 / 100`
- record ID와 normalized text 중복 0
- 35개 phrase family
- 한 phrase family가 여러 relevance class를 넘지 않음
- `intent`와 `actions`가 candidate record에 없음
- preference/domain candidate는 grocery alias를 포함
- unrelated candidate는 grocery alias를 포함하지 않음
- manifest SHA-256과 실제 dataset hash 일치

`candidate_label_only: true`는 생성 label을 human ground truth로 오인하지 않게 하는
명시적 표시다.

## 재생성

```bash
cd /home/jjiwoo/.workspace/jangoing
python3 ml/data_generation/generate_relevance_candidates.py
```

pytest가 설치된 ML virtual environment에서는:

```bash
source ml/.venv/bin/activate
pytest ml/tests/test_relevance_candidates.py
```

## Production D1 import

```bash
cd /home/jjiwoo/.workspace/jangoing
npm run annotation:import-generated -- --remote \
  --input ml/datasets/relevance-candidates-v1.jsonl \
  --label relevance-candidates-v1
```

같은 label로 다시 실행하면 stable ID를 사용해 같은 inference row를 갱신한다. 같은
dataset을 다른 label로 반복 import하면 annotation되지 않은 중복 후보가 생길 수
있으므로 피한다.

Import 후 예상 queue:

- `Load preference/context`: 200 candidates
- `Load domain non-actionable`: 300 candidates
- `Load unrelated negative`: 100 candidates

이미 annotation된 row는 queue에서 제외되므로 실제 available count는 검수 진행에
따라 감소한다.

## 권장 Pilot

600개를 바로 모두 검수하지 않는다. 먼저 다음 120개를 검수한다.

- contextual/preference: 40
- domain non-actionable: 60
- unrelated: 20

Pilot에서 확인할 것:

- candidate relevance가 실제 convention과 맞는 비율
- 두 class 사이에서 반복적으로 모호한 phrase family
- 어색하거나 비현실적인 item 조합
- 동일 template가 너무 쉽게 보이는지
- annotator가 candidate preselection에 그대로 끌리는지

문제가 있으면 scenario와 generator를 수정하고 새 dataset version을 만든다. 이미
검수한 annotation을 조용히 다른 문장으로 덮어쓰지 않는다.

## Reviewed export

사람이 검수한 뒤에만 relevance ground truth를 export한다.

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

Importer가 저장한 generated phrase family는 action이 없는 reviewed record의
`phrase_family`로 export된다. 따라서 같은 template family가 train과 evaluation에
섞이면 leakage validation이 이를 감지할 수 있다.

## 한계

- 모든 문장은 deterministic template에서 생성됐으며 실제 사용자 분포가 아니다.
- Generated relevance는 사람이 검수하기 전까지 정답이 아니다.
- Grocery alias overlap은 통제하지만, 더 미세한 lexical shortcut까지 제거하지는
  못한다.
- Personal preference와 단순 food opinion의 경계는 일부 문장에서 모호할 수 있다.
- 최종 evaluation set은 이 synthetic candidate가 아니라 독립적인 reviewed human
  utterance 중심으로 구성해야 한다.
