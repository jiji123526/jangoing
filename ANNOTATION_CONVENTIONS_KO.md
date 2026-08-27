# Annotation Convention v1

## 문서 목적

이 문서는 `/annotate`에서 영어 대화 데이터를 라벨링할 때 사용하는 **정답 결정
규칙**이다. 화면 조작법은 `ANNOTATION_GUIDE_KO.md`를 참고한다. 같은 문장을 누가
라벨링하더라도 intent, entity span, normalized value, 데이터 용도가 최대한 같아지는
것이 이 문서의 목표다.

- convention version: `annotation-v1`
- 기본 언어/locale: 영어, `en-US`
- 적용 범위: 실제 사용자 표현과 사람이 검토하는 영어 문장
- 우선순위: 원문 의미 > 대화 맥락 > parser 예측

현재 화면에는 이전 대화 맥락을 함께 저장하는 필드가 없다. 따라서 **현재 문장만으로
안전하게 판단할 수 없는 경우 추측하지 않고 `needs_clarification`을 선택한다.**

## 한 문장을 처리하는 순서

항상 다음 순서로 판단한다.

1. 원문을 수정하거나 문법을 교정하지 않고 그대로 입력한다.
2. 화자가 지금 원하는 행동 하나를 intent로 선택한다.
3. 그 행동에 필요한 원문 표현만 entity로 선택한다.
4. 각 entity를 canonical value로 정규화한다.
5. 문장 구조를 나타내는 phrase family를 지정한다.
6. 독립 평가용인지 학습용인지 선택한다.
7. 규칙으로 해결되지 않은 판단만 notes에 기록한다.

## 원문 보존 규칙

- 대소문자, 축약형, 오타, 구두점은 사용자가 입력한 그대로 보존한다.
- `We're out of milk`를 `We are out of milk`로 고치지 않는다.
- 하나의 입력에는 하나의 발화만 넣는다.
- 개인 식별 정보, 비밀번호, 결제 정보 등 민감한 내용은 입력하지 않는다.
- 완전히 같은 문장을 다시 입력하지 않는다. 단, 의미 있는 철자 오류나 표현 차이는
  별도 문장으로 허용한다.

## Intent convention

Intent는 키워드가 아니라 **화자의 주된 목표**로 결정한다. 한 문장에 여러 행동이
명시된 경우 현재 스키마는 multi-intent를 지원하지 않으므로 문장을 분리한다. 분리할
수 없는 실제 발화라면 `needs_clarification`으로 두고 notes에 이유를 적는다.

| Intent | 선택 기준 | 예시 |
|---|---|---|
| `add_item` | 물건이 들어왔거나 재고에 추가하라는 요청 | `Add two cartons of milk.` |
| `consume_item` | 먹거나 사용해서 재고가 줄었다는 보고 | `I used one egg.` |
| `mark_low` | 아직 남아 있지만 부족하거나 거의 소진됨 | `We're low on eggs.` |
| `throw_away` | 버렸거나 폐기하라는 요청 | `Throw away the spinach.` |
| `add_to_buy` | 쇼핑 목록에 추가하라는 명시적 요청 | `Put yogurt on the shopping list.` |
| `query_inventory` | 보유 여부·수량·위치·유통기한을 묻는 요청 | `Do we have milk?` |
| `needs_clarification` | 도메인 관련성이 있지만 안전한 행동이나 대상이 불명확함 | `Put that on the list.` |
| `unknown` | 재고·쇼핑 행동과 무관하거나 지원하지 않는 목표 | `I like coffee.` |

### 부족함을 말하는 표현

- `We're low on milk`처럼 조금 남았다는 의미이면 `mark_low`다.
- `We're out of milk`는 재고가 0이라는 상태를 말하지만 현재 intent에는 `mark_out`이
  없다. 쇼핑 목록 추가가 **명시되지 않았다면** 자동으로 `add_to_buy`로 바꾸지 않고
  `needs_clarification`으로 둔다.
- `We're out of milk, add it to the list`는 명시적인 최종 요청이 있으므로
  `add_to_buy`다.
- `We're out of drinks`도 같은 규칙을 적용하며 `drinks`는 `CATEGORY`다.

### `unknown`과 `needs_clarification`

- 관련 없는 문장: `unknown`
- 관련은 있지만 무엇을 해야 할지 또는 무엇을 가리키는지 모름:
  `needs_clarification`
- annotator가 개인적으로 합리적인 행동을 예상할 수 있다는 이유만으로 intent를
  추론하지 않는다.

## Entity convention

문장에 등장한 모든 명사를 표시하는 작업이 아니다. 현재 행동을 실행하거나 평가할 때
필요한 정보만 표시한다. entity가 없는 `unknown`이나 `needs_clarification`도 정상적인
annotation이다.

| Label | 선택 기준 | 원문 예 | normalized value 예 |
|---|---|---|---|
| `ITEM` | 특정 식품·제품 | `Coke`, `milk`, `apples` | `coke`, `milk`, `apple` |
| `CATEGORY` | 여러 상품을 포괄하는 상위 개념 | `drinks`, `snacks`, `fruit` | `beverage`, `snack`, `fruit` |
| `QUANTITY` | 개수나 양의 숫자 표현 | `two`, `a couple` | `2` |
| `UNIT` | 수량의 측정·포장 단위 | `cartons`, `bottles` | `carton`, `bottle` |
| `LOCATION` | 현재 지원하는 보관 장소 | `fridge`, `freezer`, `pantry` | `fridge`, `freezer`, `pantry` |
| `EXPIRY_DATE` | 유통기한을 나타내는 날짜 표현 | `tomorrow`, `2026-09-01` | 가능하면 `YYYY-MM-DD` |

### Span 경계

- 원문에 실제로 보이는 연속된 문자만 선택한다.
- 의미 없는 앞뒤 공백, 관사, 소유격, 구두점은 제외한다.
- 수량과 단위는 합치지 않고 따로 선택한다: `[two] [cartons] of [milk]`.
- 복합 상품명은 의미 단위 전체를 선택한다: `[peanut butter]`.
- 수식어가 상품 정체성의 일부면 포함한다: `[oat milk]`, `[diet Coke]`.
- 단순 상태 표현은 entity에 포함하지 않는다: `low on`, `out of`, `expired`.
- entity span끼리는 겹치거나 중첩할 수 없다.
- 원문에 없는 생략된 대상을 entity로 만들어내지 않는다.

### ITEM과 CATEGORY

핵심 질문은 “하나의 canonical product를 가리키는가, 여러 후보를 포괄하는가?”다.

- `milk` → `ITEM: milk`
- `oat milk` → `ITEM: oat_milk`
- `Coke` → `ITEM: coke`
- `drinks` / `beverages` / `something to drink` → `CATEGORY: beverage`
- `fruit` → 문맥상 특정 과일이 정해지지 않았다면 `CATEGORY: fruit`
- `apples` → `ITEM: apple`

카테고리를 임의의 구체 상품으로 바꾸지 않는다. 예를 들어 `drinks`를 `water`로
정규화하면 안 된다. 향후 추천 시스템은 `beverage`라는 범주를 입력으로 받아 별도의
조건과 재고·가격 정보를 사용해 상품을 고르게 된다.

## Normalization convention

Normalized value는 번역문이나 설명이 아니라 시스템이 비교할 canonical ID다.

- 영문 소문자 `snake_case`를 사용한다: `oat_milk`, `peanut_butter`.
- 복수형은 단수형으로 통일한다: `apples` → `apple`.
- 동일 개념의 표현은 같은 값으로 합친다: `drinks`, `beverages` → `beverage`.
- 브랜드가 명시되면 의미가 있을 때 보존한다: `Coke` → `coke`.
- 숫자 표현은 숫자로 통일한다: `two`, `a couple` → `2`.
- 단위는 단수 canonical form을 쓴다: `bottles` → `bottle`.
- LOCATION은 현재 contract가 허용하는 `fridge`, `freezer`, `pantry`만 사용한다.
- 상대 날짜는 annotation 날짜와 timezone이 명확할 때만 ISO 날짜로 변환한다.
  확신할 수 없으면 원문 표현을 유지하고 notes에 기록한다.
- taxonomy에 canonical ID가 있으면 새 값을 만들기 전에 기존 ID를 사용한다.
- 확실하지 않은 정규화 값을 추측하지 않는다. 비워 두고 notes에 후보를 기록한다.

`/annotate`는 이 규칙을 지키도록 label별 선택 메뉴를 제공한다. ITEM과 CATEGORY는
`grocery-v1`, LOCATION은 API contract, QUANTITY와 UNIT은 annotation-v1의 controlled
value 목록을 사용한다. EXPIRY_DATE는 ISO 형식을 보장하는 날짜 선택기를 사용한다.
필요한 값이 메뉴에 없으면 가까운 값을 대신 선택하지 말고 비워 둔 뒤 notes에 남긴다.

## Phrase family convention

Phrase family는 상품명 같은 slot 값이 아니라 **표현 구조와 화용적 기능**을 묶는다.
모델이 거의 같은 문장을 학습하고 시험받는 data leakage를 막는 용도다.

- 소문자 `snake_case`로 작성한다.
- intent 이름만 쓰지 말고 구조를 구분한다.
- item이나 category 이름을 family에 넣지 않는다.
- 단어만 교체한 문장들은 같은 family를 사용한다.

예:

| 문장 | Phrase family |
|---|---|
| `We're low on milk.` / `We're low on eggs.` | `state_low_on_item` |
| `We're out of milk.` / `We're out of drinks.` | `state_out_of_entity` |
| `Add milk to the list.` / `Put eggs on the list.` | `explicit_add_to_list` |
| `Do we have milk?` / `Do we have apples?` | `yes_no_inventory_query` |
| `Put that on the list.` / `Use that one.` | `unresolved_reference` |

새 family가 필요한지 애매하면 기존 데이터의 문장 구조를 먼저 비교한다. 단순 동의어
교체라면 같은 family, 문장 행위나 구문 구조가 달라지면 새 family로 분리한다.

## Train/Evaluation convention

### `train_candidate`

- synthetic 문장의 검토본
- 기존 phrase family의 추가 variation
- 규칙을 정립하기 위해 만든 예문
- 이미 모델 개발 과정에서 본 문장

### `evaluation_candidate`

- 실제 사용자가 자연스럽게 만든 독립 표현
- 기존 template를 보고 단어만 바꾸지 않은 문장
- 모델·학습 데이터·현재 오류 분석을 보기 전에 확보한 문장
- intent와 entity 정답을 사람이 확인한 문장

`evaluation_candidate`는 즉시 최종 test set이 아니다. 중복 제거, family 단위 분리,
품질 검토, 버전 고정 후에만 frozen evaluation set이 된다. 같은 phrase family는
train과 evaluation에 나누어 넣지 않는다.

## Notes convention

명확한 문장은 notes를 비워 둔다. 다음 경우에만 짧고 객관적인 영어 문장으로 남긴다.

- 두 intent 사이에서 결정한 근거
- taxonomy에 없는 canonical value
- 상대 날짜를 해석한 기준 날짜/timezone
- multi-intent 또는 문맥 부족 문제
- convention에서 다루지 않은 새로운 edge case

예:

```text
Implicit out-of-stock statement; no explicit shopping-list request.
```

## 일관성 확인 체크리스트

저장 전에 다음을 확인한다.

- 원문을 고치지 않았는가?
- intent가 키워드가 아니라 화자의 목표를 나타내는가?
- 불명확한 의미를 임의로 추측하지 않았는가?
- span이 원문의 정확한 연속 부분과 일치하는가?
- ITEM과 CATEGORY를 구분했는가?
- normalized value가 canonical 형식인가?
- 유사 template에 동일한 phrase family를 사용했는가?
- evaluation 후보가 기존 template의 변형은 아닌가?
- 특별한 판단이 있었다면 notes에 근거를 남겼는가?

## Convention 변경 절차

새로운 사례가 이 문서로 해결되지 않으면 annotator마다 임의 규칙을 만들지 않는다.

1. 해당 record를 `needs_clarification` 또는 가장 보수적인 라벨로 저장한다.
2. notes에 edge case와 가능한 선택지를 기록한다.
3. 팀이 기준을 결정한 뒤 이 문서를 먼저 수정한다.
4. 의미가 바뀌는 변경이면 convention/schema version을 올린다.
5. 기존 annotation 중 영향을 받는 범위를 찾아 재검토한다.

단순 오탈자 수정은 버전을 올리지 않는다. intent 의미, entity 경계, normalization,
split 정책이 바뀌면 새 버전이 필요하다.
