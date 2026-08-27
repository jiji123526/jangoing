# Annotation Convention v2

## 문서 목적

이 문서는 `/annotate`에서 영어 대화 데이터를 라벨링할 때 사용하는 **정답 결정
규칙**이다. 화면 조작법은 `ANNOTATION_GUIDE_KO.md`를 참고한다. 같은 문장을 누가
라벨링하더라도 intent, entity span, normalized value, 데이터 용도가 최대한 같아지는
것이 이 문서의 목표다.

- convention version: `annotation-v2`
- 기본 언어/locale: 영어, `en-US`
- 적용 범위: 실제 사용자 표현과 사람이 검토하는 영어 문장
- 우선순위: 원문 의미 > 대화 맥락 > parser 예측

현재 화면에는 이전 대화 맥락을 함께 저장하는 필드가 없다. 따라서 **현재 문장만으로
안전하게 판단할 수 없는 경우 추측하지 않고 `needs_clarification`을 선택한다.**

## 한 문장을 처리하는 순서

항상 다음 순서로 판단한다.

1. 원문을 수정하거나 문법을 교정하지 않고 그대로 입력한다.
2. 화자가 원하는 독립 행동마다 action을 하나 만든다.
3. 각 action의 intent를 선택한다.
4. 해당 action에 필요한 원문 표현만 entity로 연결한다.
5. 각 entity를 canonical value로 정규화한다.
6. action별 문장 구조를 나타내는 phrase family를 지정한다.
7. 발화 전체가 독립 평가용인지 학습용인지 선택한다.
8. 규칙으로 해결되지 않은 판단만 notes에 기록한다.

## 원문 보존 규칙

- 대소문자, 축약형, 오타, 구두점은 사용자가 입력한 그대로 보존한다.
- `We're out of milk`를 `We are out of milk`로 고치지 않는다.
- 하나의 입력에는 하나의 발화만 넣는다.
- 개인 식별 정보, 비밀번호, 결제 정보 등 민감한 내용은 입력하지 않는다.
- 완전히 같은 문장을 다시 입력하지 않는다. 단, 의미 있는 철자 오류나 표현 차이는
  별도 문장으로 허용한다.

## Intent convention

Intent는 키워드가 아니라 **화자의 목표**로 결정한다. 한 문장에 여러 독립 행동이
명시된 경우 action을 추가하고 각 action에 intent와 entity를 연결한다. 여러 절이 있어도
실제로는 하나의 목표라면 action을 불필요하게 나누지 않는다.

예를 들어 `Add milk to the list and throw away the spinach`는 두 action이다. 반면
`Add milk and eggs to the list`는 하나의 쇼핑-list 행동으로 볼 수 있다. 현재 normalized
object가 동일 label 여러 개를 완전히 표현하지 못하는 경우에는 같은 intent action을
항목별로 나누고 notes에 이유를 남긴다.

| Intent | 선택 기준 | 예시 |
|---|---|---|
| `add_item` | 물건이 들어왔거나 재고에 추가하라는 요청 | `Add two cartons of milk.` |
| `update_expiry` | 기존 item의 유통기한 정보를 추가·수정·명시하는 요청/보고 | `The milk expires next Friday.` |
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

### `add_item`과 `update_expiry`

- `Add milk expiring next Friday`처럼 **item을 새로 넣는 행동**이 핵심이면 `add_item`이다.
- `The milk expires next Friday`, `Set the yogurt expiry to Friday`처럼
  **기존 item의 expiry metadata를 붙이거나 고치는 행동**이 핵심이면 `update_expiry`다.
- inventory 추가와 expiry 갱신이 한 문장에 둘 다 독립적으로 있으면 action을 나눈다.

### `unknown`과 `needs_clarification`

- 관련 없는 문장: `unknown`
- 관련은 있지만 무엇을 해야 할지 또는 무엇을 가리키는지 모름:
  `needs_clarification`
- annotator가 개인적으로 합리적인 행동을 예상할 수 있다는 이유만으로 intent를
  추론하지 않는다.

## Entity convention

문장에 등장한 모든 명사를 표시하는 작업이 아니다. **현재 선택된 action**을 실행하거나
평가할 때 필요한 정보만 그 action에 표시한다. entity가 없는 `unknown`이나
`needs_clarification` action도 정상적인 annotation이다.

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
- 같은 action의 entity span끼리는 겹치거나 중첩할 수 없다.
- 동일 span이 실제로 여러 action에 필요하면 action별로 한 번씩 연결할 수 있다.
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
- ITEM, CATEGORY, UNIT에 필요한 canonical 값이 목록에 없지만 의미가 분명하면
  annotator가 새 `snake_case` 값을 직접 입력한다. 저장 후 다음 annotation부터
  추천값으로 다시 나타난다.
- 확실하지 않은 정규화 값을 추측하지 않는다. 이 경우 새 값을 만들어 넣지 말고
  span 또는 intent 판단을 다시 검토하고 notes에 이유를 남긴다.

### reviewed annotation에서 normalized value 필수 규칙

- `ITEM`, `CATEGORY`, `UNIT`, `LOCATION`, `EXPIRY_DATE`는 reviewed annotation에서
  normalized value가 **필수**다.
- `EXPIRY_DATE`의 normalized value는 반드시 `YYYY-MM-DD` 형식이어야 한다.
- `QUANTITY`는 현재 예외적으로 비워 둘 수 있다. 다만 가능하면 숫자 값으로 채운다.
- 필수 label의 normalized value가 확실하지 않다면 억지로 틀린 값을 넣지 말고,
  span 또는 intent 판단 자체를 다시 검토한 뒤 notes에 이유를 남긴다.

`/annotate`는 이 규칙을 지키도록 label별 normalized value 입력 방식을 구분한다.

- ITEM, CATEGORY, UNIT: 기존 canonical 값 추천 + 새 값 직접 입력
- QUANTITY: 숫자 입력 + 기존 숫자 추천
- LOCATION: `fridge`, `freezer`, `pantry` 중 선택
- EXPIRY_DATE: ISO 형식을 보장하는 날짜 선택기

ITEM, CATEGORY, UNIT은 추천 목록에 없는 새 canonical 값을 바로 입력할 수 있다.
저장되면 이후 annotation에서 자동 추천 목록에 합쳐진다. LOCATION은 product contract
제약 때문에 새 값을 만들지 않는다.

## Phrase family convention

Phrase family는 상품명 같은 slot 값이 아니라 **표현 구조와 화용적 기능**을 묶는다.
모델이 거의 같은 문장을 학습하고 시험받는 data leakage를 막는 용도다.

- 소문자 `snake_case`로 작성한다.
- intent 이름만 쓰지 말고 구조를 구분한다.
- item이나 category 이름을 family에 넣지 않는다.
- 단어만 교체한 문장들은 같은 family를 사용한다.

`/annotate`에서는 현재 intent에 맞는 controlled family만 선택할 수 있다. 목록에 맞는
구조가 없으면 유사한 family로 합치지 말고 선택을 비워 둔 뒤 notes에 새 family 후보를
기록한다. 합의 후 shared contract의 목록과 이 문서를 함께 수정한다.

예:

| 문장 | Phrase family |
|---|---|
| `We're low on milk.` / `We're low on eggs.` | `state_low_on_entity` |
| `We're out of milk.` / `We're out of drinks.` | `state_out_of_entity` |
| `Add milk to the list.` / `Put eggs on the list.` | `explicit_add_to_list` |
| `Do we have milk?` / `Do we have apples?` | `yes_no_inventory_query` |
| `Put that on the list.` / `Use that one.` | `unresolved_reference` |

새 family가 필요한지 애매하면 기존 데이터의 문장 구조를 먼저 비교한다. 단순 동의어
교체라면 같은 family, 문장 행위나 구문 구조가 달라지면 새 family로 분리한다.

### Phrase family 선택 원칙

- phrase family는 **intent를 먼저 확정한 뒤** 고른다. intent가 달라지면 family도 다시 고른다.
- family 이름의 `entity`는 `ITEM`과 `CATEGORY`를 모두 포함한다.
- 표면 단어보다 **문장의 기능**을 본다. 예를 들어 `need`가 들어 있어도 실제 기능이
  쇼핑 요청이면 `add_to_buy`, 재고 부족 상태 보고면 `mark_low` 계열 family를 고른다.
- 더 구체적인 family가 명시되면 더 일반적인 family보다 우선한다.
  예: `expired`가 명시되면 generic discard family보다 `expired_item_discard`를 우선한다.
- 시제와 화행이 분명하면 그대로 반영한다.
  예: 명령은 request 계열, 이미 일어난 일의 보고는 report 계열 family를 우선한다.
- 같은 의미라도 item, category, 수량만 바뀐 문장은 같은 family를 유지한다.

### Intent별 family 경계

#### `add_item`

- `explicit_add_to_inventory`
  재고에 넣으라는 **직접적 추가 요청**이다.
  예: `Add milk.`, `Put two cartons of milk in the fridge.`
  `bought`, `picked up`, `got`처럼 이미 확보한 사실을 보고하면 이 family가 아니라
  `purchased_item_report`를 쓴다. 문장의 핵심이 저장 위치 지시라면
  `storage_instruction`이 더 맞다.

- `purchased_item_report`
  이미 사 왔거나 들어왔다는 **사후 보고**다.
  예: `I bought milk.`, `We picked up eggs today.`
  명령형으로 지금 넣으라는 말은 아니다. quantity가 있다는 이유만으로 자동으로
  `quantity_addition`으로 바꾸지 않는다.

- `storage_instruction`
  핵심이 **어디에 보관할지**에 있다.
  예: `Put the yogurt in the fridge.`, `Store the meat in the freezer.`
  location이 있어도 핵심이 단순 inventory 추가라면 `explicit_add_to_inventory`를
  유지한다.

- `quantity_addition`
  핵심이 **얼마나 더 들어왔는지** 또는 **얼마를 더할지**에 있다.
  예: `Add one more carton of milk.`, `We added three more eggs.`
  단순히 quantity가 포함된 일반 add 문장은 아니다. 수량이 문장의 중심이 아닐 때는
  `explicit_add_to_inventory` 또는 `purchased_item_report`를 쓴다.

#### `update_expiry`

- `explicit_set_expiry`
  핵심이 **기존 item의 expiry date를 설정하거나 기록하는 직접 요청**이다.
  예: `Set the milk expiry to Friday.`, `Add an expiration date for the yogurt.`
  item을 새로 넣는 행동이 중심이면 `add_item`으로 간다.

- `expiry_metadata_report`
  기존 item의 expiry 정보를 **보고하거나 명시**한다.
  예: `The milk expires next Friday.`, `These eggs are good until Monday.`
  질문이면 `query_inventory`의 `expiry_inventory_query`, 폐기 판단이면
  `throw_away`의 `expired_item_discard`를 본다.

- `expiry_metadata_correction`
  이미 알고 있던 expiry 정보를 **정정**한다.
  예: `Actually, the yogurt expires tomorrow.`, `The earlier date was wrong; it's Friday.`
  단순 새 정보 보고인데 correction 맥락이 없으면 `expiry_metadata_report`를 쓴다.

#### `consume_item`

- `consumed_item_report`
  먹거나 마셔서 재고가 줄었다는 **직접 소비 보고**다.
  예: `I ate two yogurts.`, `We drank the juice.`
  요리나 재료 사용에 초점이 있으면 `used_item_report`가 더 맞다.

- `used_item_report`
  먹었다기보다 **요리, 조리, 사용**에 초점이 있다.
  예: `I used one egg.`, `We used half the milk for pancakes.`
  실제 섭취를 말하면 `consumed_item_report`를 쓴다.

- `finished_item_report`
  특정 item을 **다 써서 끝냈다**는 완료 상태 보고다.
  예: `We finished the milk.`, `I used up the yogurt.`
  단순 low 상태는 `mark_low`이고, `We're out of milk`처럼 결과 상태만 있고 실제
  소비 event가 명시되지 않으면 `needs_clarification`의 `state_out_of_entity`를 쓴다.

- `quantity_consumed`
  소비나 사용의 핵심이 **정확한 소모량**에 있다.
  예: `I used half a carton of milk.`, `We ate three eggs.`
  수량이 있어도 단순 report로 읽히면 generic family를 유지한다. 이 family는 “양을
  빼는 구조”가 문장 중심일 때만 쓴다.

#### `mark_low`

- `state_low_on_entity`
  `low on`, `running low on`처럼 **명시적 부족 상태**를 말한다.
  예: `We're low on milk.`, `We're running low on drinks.`
  거의 다 떨어졌다는 뉘앙스면 `state_almost_out`이 더 맞다.

- `state_almost_out`
  `almost out`, `almost gone`, `barely any left`처럼 **임박한 고갈**을 말한다.
  예: `We're almost out of eggs.`, `The milk is almost gone.`
  완전히 0이 되었고 그 상태만 말하면 `state_out_of_entity` 쪽이다.

- `need_more_soon`
  핵심이 **곧 더 필요해질 것**이라는 전망/판단이다.
  예: `We'll need more milk soon.`, `We should get more eggs soon.`
  실제 쇼핑 요청으로 해석해 `add_to_buy` intent를 줬다면 이 family를 쓰지 않는다.
  명시적 low-state 표현이 있으면 `state_low_on_entity`를 우선한다.

- `quantity_running_low`
  현재 남은 양이 적다는 점이 **수량 표현으로 직접 드러난다**.
  예: `We only have one egg left.`, `There's half a carton left.`
  단순 yes/no 질문은 query이고, 완전 소진이면 `state_out_of_entity`다.

#### `throw_away`

- `explicit_discard_request`
  핵심이 **버리라는 직접 요청**이다.
  예: `Throw away the spinach.`, `Discard the old yogurt.`
  `expired`, `spoiled`, `moldy` 같은 이유가 중심이면 각각 더 구체적인 family를 쓴다.

- `spoiled_item_discard`
  버리는 이유가 **상함, 부패, 맛/냄새 이상**이다.
  예: `Throw away the spoiled milk.`, `The spinach went bad, toss it.`
  날짜가 지나서 버리는 경우는 `expired_item_discard`다.

- `thrown_away_report`
  이미 **버렸다는 완료 보고**다.
  예: `I threw away the spinach.`, `We tossed the old bread.`
  완료 보고이면서 동시에 `expired`/`spoiled`가 핵심이면 generic report보다 이유
  중심 family를 우선한다.

- `expired_item_discard`
  버리는 이유가 **유통기한 경과 또는 expiry 판단**이다.
  예: `Throw away the expired yogurt.`, `I tossed the milk because it expired.`
  단순히 오래돼 보여서 버린다면 `spoiled_item_discard`가 더 맞을 수 있다.

#### `add_to_buy`

- `explicit_add_to_list`
  쇼핑 목록에 넣으라는 **명시적 list 조작**이다.
  예: `Add milk to the list.`, `Put eggs on the shopping list.`
  `buy milk`처럼 list를 말하지 않고 구매 자체를 요청하면 `purchase_request` 또는
  `need_to_buy`를 쓴다.

- `purchase_request`
  화자가 **지금 사 오거나 가져오라**고 직접 요청한다.
  예: `Buy milk.`, `Pick up eggs.`, `Get more yogurt.`
  necessity statement라면 `need_to_buy`, reminder 구조라면 `shopping_reminder`다.

- `need_to_buy`
  화자가 **사야 한다는 필요성**을 진술한다.
  예: `We need to buy milk.`, `I need eggs.`
  imperative tone이 강하면 `purchase_request`가 더 맞다. 단순 부족 상태 보고만 있고
  구매 요청이 명시되지 않으면 `mark_low` 또는 `needs_clarification`을 본다.

- `shopping_reminder`
  나중 쇼핑을 위한 **메모/리마인더**다.
  예: `Remind me to buy milk.`, `Don't let me forget eggs.`
  지금 즉시 구매를 시키는 직접 요청은 아니다.

#### `query_inventory`

- `yes_no_inventory_query`
  존재 여부를 묻는 **예/아니오형 질문**이다.
  예: `Do we have milk?`, `Is there any yogurt?`
  남은 양을 묻는다면 `quantity_inventory_query`다.

- `quantity_inventory_query`
  남은 **양, 개수, 분량**을 묻는다.
  예: `How much milk is left?`, `How many eggs do we have?`
  `Do we have any milk left?`는 존재 확인이 중심이면 `yes_no_inventory_query`다.

- `location_inventory_query`
  물건이 **어디 있는지**를 묻는다.
  예: `Where is the yogurt?`, `Did we put the juice in the fridge or pantry?`
  location이 언급돼도 질문 초점이 존재 여부면 `yes_no_inventory_query`다.

- `expiry_inventory_query`
  유통기한이나 expiry status를 묻는다.
  예: `When does the milk expire?`, `Is the yogurt still good?`
  단순 재고 존재 여부와 expiry 질문이 함께 있으면, 실제 질문 초점이 무엇인지 보고
  하나를 고른다. 둘 다 독립 질문이면 action을 나눈다.

#### `needs_clarification`

- `state_out_of_entity`
  `We're out of ...`처럼 **0개 상태는 보이지만 시스템이 취할 행동이 명시되지 않은**
  경우다.
  예: `We're out of milk.`, `We're out of drinks.`
  `Add it to the list`가 이어지면 해당 action은 `add_to_buy`로 따로 라벨링한다.
  실제로 다 먹었음을 보고하는 완결 event라면 `finished_item_report`를 검토한다.

- `unresolved_reference`
  `that`, `it`, `the usual one`처럼 **지시 대상이 현재 문장만으로 복원되지 않는다**.
  예: `Put that on the list.`, `Use that one.`
  action은 보이지만 object가 불명확한 경우다.

- `vague_category_request`
  category는 보이지만 **무엇을 어떻게 하라는지 충분히 구체적이지 않다**.
  예: `We need some drinks.`, `Get something sweet.`
  category 수준의 명시적 list action으로 보지 않는 현재 규칙 때문에 여기로 간다.

- `usual_items_request`
  household-specific routine set을 요구하지만 **구성원이 현재 문장에 없다**.
  예: `Buy the usual.`, `Get our regular groceries.`
  annotator 개인 상식으로 usual set을 상상하지 않는다.

- `ambiguous_action`
  대상은 비교적 분명하지만 **무슨 행동을 원하는지** 불명확하다.
  예: `Milk.`, `Eggs next.`, `Handle the yogurt.`
  domain과 관련은 있으나 add/query/discard/consume 중 무엇인지 고를 근거가 부족하다.

#### `unknown`

- `preference_statement`
  취향, 선호, 일반 의견 표현이다.
  예: `I like coffee.`, `We prefer oat milk.`
  재고를 바꾸거나 목록에 넣으라는 요청이 아니다.

- `unrelated_question`
  주방 inventory/shopping domain과 무관한 질문이다.
  예: `What's the weather?`, `When is the meeting?`
  domain 관련이지만 현재 intent set 밖 기능이면 `unsupported_request`를 본다.

- `unrelated_statement`
  domain과 무관한 평서문이다.
  예: `I'm tired today.`, `The movie was good.`
  preference나 capability request도 아니다.

- `unsupported_request`
  domain 관련성은 있지만 **현재 지원 intent 바깥의 명확한 요청**이다.
  예: `What should I cook tonight?`, `Find the cheapest milk brand.`
  이 경우는 불명확해서 clarification이 필요한 것이 아니라, 요청 의미는 명확하지만
  현재 시스템 capability 밖이기 때문에 `unknown`으로 둔다.

## Train/Evaluation convention

### `train_candidate`

- synthetic 문장의 검토본
- 기존 phrase family의 추가 variation
- 규칙을 정립하기 위해 만든 예문
- 이미 모델 개발 과정에서 본 문장
- `correction queue`, `expiry queue`, `low-confidence queue`, `confirmed queue`에서
  가져온 대부분의 annotation 후보

### `evaluation_candidate`

- 실제 사용자가 자연스럽게 만든 독립 표현
- 기존 template를 보고 단어만 바꾸지 않은 문장
- 모델·학습 데이터·현재 오류 분석을 보기 전에 확보한 문장
- intent와 entity 정답을 사람이 확인한 문장
- 기본적으로 `evaluation holdout` queue에서 가져온 후보

`evaluation_candidate`는 즉시 최종 test set이 아니다. 중복 제거, family 단위 분리,
품질 검토, 버전 고정 후에만 frozen evaluation set이 된다. 같은 phrase family는
train과 evaluation에 나누어 넣지 않는다.

### Queue와 dataset purpose 관계

- `correction queue`
  모델이 실제로 틀렸고 사용자가 correction을 남긴 문장을 모은다.
  기본 목적은 error-focused `train_candidate` 수집이다.

- `expiry queue`
  날짜/유통기한 signal이 있는 문장을 모은다.
  기본 목적은 `EXPIRY_DATE` span과 normalization 품질을 높이는
  `train_candidate` 수집이다.

- `low-confidence queue`
  confidence가 낮거나 `unknown`, `needs_clarification`에 가까운 문장을 모은다.
  기본 목적은 active-learning 성격의 `train_candidate` 수집이다.

- `confirmed queue`
  모델이 맞았고 사용자가 confirmed한 실사용 문장을 모은다.
  기본 목적은 실제 production 분포에 가까운 `train_candidate` 보강이다.

- `evaluation holdout`
  reviewed 문장 중 deterministic bucket 규칙으로 분리한 후보를 모은다.
  기본 목적은 `evaluation_candidate` 수집이다.

queue는 **샘플을 어디서 가져왔는지**를 나타내고, dataset purpose는 **최종 split에서
어디에 들어갈지**를 나타낸다. 보통 queue의 기본 목적을 따르지만, annotator는 특별한
근거가 있을 때 다른 purpose로 저장할 수 있다. 다만 이런 경우 notes에 이유를 남기는
편이 좋다.

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
