# Open Food Facts 브랜드·상품 정규화 전략

Last updated: 2026-08-28

## 목적

이 문서는
[Open Food Facts product database](https://huggingface.co/datasets/openfoodfacts/product-database)를
Jangoing에 어떤 용도로 사용할 수 있는지와, 브랜드·상품명 정규화를 어떤 구조로
확장할지 기록한다.

핵심 결정은 다음과 같다.

> Open Food Facts는 intent 발화 학습 데이터가 아니라 상품 catalog와 entity-linking
> 후보를 만드는 외부 지식원으로 사용한다.

Open Food Facts의 한 행은 대체로 실제 포장 상품을 나타낸다. 반면 Jangoing의
intent 모델이 필요한 데이터는 `We're out of Coke`와 같은 사용자 발화와 그
행동 라벨이다. 따라서 Open Food Facts만으로 `mark_out`, `add_to_buy`,
`query_inventory` 같은 intent를 학습할 수는 없다.

## 사용할 수 있는 정보

필요한 필드가 실제 dataset version에 존재하는지 import 전에 확인해야 하지만,
다음 종류의 정보가 유용하다.

- barcode 또는 source product code
- 상품명과 generic name
- 브랜드
- category와 category tag
- 판매 국가와 언어
- package quantity
- ingredient 또는 allergen metadata
- 원본 record provenance

Jangoing에서는 이를 다음 작업에 사용한다.

1. 새로운 canonical item 후보 발견
2. 브랜드명과 상품명 alias 수집
3. item-category 관계 구성
4. entity-linking 후보 검색
5. unseen alias와 unknown product 평가셋 구성

다음 용도로는 직접 사용하지 않는다.

- intent label의 ground truth
- 자연스러운 household command 문장
- relevance class의 정답
- annotation 없이 바로 production canonical vocabulary에 넣는 원본

## 표현 수준을 보존하는 정규화

annotator와 entity model은 사용자가 실제로 말한 specificity를 보존한다.

```text
"soda"      -> CATEGORY: soda
"Coke"      -> ITEM: coca_cola
"Sprite"    -> ITEM: sprite
"Coke Zero" -> ITEM: coca_cola_zero_sugar
```

`soda`를 임의로 `coca_cola`로 구체화하지 않고, `Coke Zero`를 단순히 `soda`로
축소하지 않는다. household inventory와 연결하는 작업은 annotation 이후의
entity-linking 단계에서 수행한다.

MVP에서는 `BRAND` entity를 별도로 추가하지 않는다. 다음처럼 브랜드가 포함된 전체
제품 mention을 하나의 `ITEM` span으로 라벨링한다.

```text
"We're out of Coke Zero"
                 ^^^^^^^^^ ITEM -> coca_cola_zero_sugar
```

`BRAND` label은 `any soda made by Coca-Cola`처럼 브랜드 자체에 독립적인 조건을
걸어야 할 실제 기능이 생겼을 때 추가한다. 지금 미리 분리하면 annotation 비용과
모델 복잡도만 늘고 적용할 action은 없다.

## 제안하는 grocery-v2 catalog 구조

현재 `ml/taxonomy/grocery-v1.json`은 작은 synthetic taxonomy이며 product family,
brand, variant, provenance를 충분히 표현하지 못한다. 다음 버전에서는 개념과 외부
source record를 분리한다.

```json
{
  "id": "coca_cola_zero_sugar",
  "display_name": "Coca-Cola Zero Sugar",
  "product_family_id": "cola",
  "brand_id": "coca_cola",
  "category_id": "soda",
  "aliases": {
    "en": ["Coke Zero", "Coca-Cola Zero", "Coca-Cola Zero Sugar"]
  },
  "source_records": [
    {
      "source": "open_food_facts",
      "source_id": "source-product-code"
    }
  ],
  "status": "active"
}
```

필요한 별도 개념은 다음과 같다.

- `category`: `beverage`, `soda`, `dairy` 같은 상위 분류
- `product_family`: `cola`, `milk`, `cracker` 같은 제품군
- `brand`: `coca_cola` 같은 제조·상표 개념
- `item`: `coca_cola_zero_sugar`, `whole_milk` 같은 정규화 대상
- `alias`: 사용자가 말할 수 있는 표면형
- `source_record`: 외부 dataset의 원본 ID와 provenance
- `status`: canonical merge나 deprecation을 지원하는 lifecycle

barcode별 package size가 다른 모든 행을 별도 canonical item으로 만들지 않는다.
여러 Open Food Facts 행이 같은 Jangoing item을 가리킬 수 있다. package size가
inventory 동작에 중요해지면 item identity가 아니라 별도 package variant로
표현한다.

## Entity extraction과 entity linking 분리

권장 runtime은 다음과 같다.

```text
entity model이 ITEM span 탐지
-> catalog에서 exact alias 후보 검색
-> normalized alias/fuzzy/context ranking
-> canonical item 또는 category 선택
-> confidence가 낮거나 후보가 여러 개면 사용자에게 질문
```

예를 들어 household inventory에 `whole_milk`만 있고 사용자가 `milk`라고 말했다면
annotation 정답은 계속 `milk`다. linker는 household context에서 `whole_milk`를
후보로 제안할 수 있지만 자동 승격은 confidence와 ambiguity 정책을 통과해야 한다.

첫 baseline은 복잡한 embedding model보다 다음 순서로 만든다.

1. 대소문자·구두점·공백을 정리한 exact alias match
2. canonical ID와 alias의 token-normalized match
3. 제한된 fuzzy match
4. household inventory와 category를 이용한 ranking
5. threshold 미만이면 `needs_clarification`

이 구조는 span model의 오류와 catalog linking 오류를 따로 평가할 수 있다.

## Import 전략

전체 Open Food Facts database를 D1 또는 taxonomy에 바로 넣지 않는다. 데이터가
매우 크고, 중복·다국어·불완전 record·package variant가 많을 수 있기 때문이다.

### 1단계: 스키마와 사용 조건 확인

- Hugging Face dataset card와 공식 Open Food Facts 문서에서 현재 field schema 확인
- 현재 database license, attribution, share-alike 의무 확인
- 이미지가 필요하다면 database와 별개인 image license 확인
- streaming 또는 filtered download 지원 여부 확인
- repository와 배포 UI에 필요한 attribution 방식 결정

라이선스 조건은 변경될 수 있으므로 이 문서는 법적 판단을 대신하지 않는다.

### 2단계: 작은 영문 subset 생성

- 영어 이름이 있는 food/beverage record만 선택
- 이름, 브랜드, category, source ID가 없는 저품질 row 제외
- 초기에는 자주 쓰는 100-500개 product concept만 후보로 생성
- raw snapshot과 transformed output을 분리 저장
- dataset revision, filter version, 실행 날짜, hash 기록

권장 경로:

```text
ml/data/external/open_food_facts/raw/
ml/data/external/open_food_facts/filtered/
ml/data/external/open_food_facts/manifests/
```

### 3단계: canonical review

- exact duplicate와 punctuation/case alias 통합
- barcode/package variant를 product concept에 묶기
- 기존 `grocery-v1`과 충돌 검사
- category mapping을 사람이 검토
- canonical merge와 deprecated ID redirect 기록

외부 record는 자동으로 production normalized-value 목록에 들어가지 않는다.
filter 결과는 candidate이며, 사람이 승인한 catalog concept만 active 상태가 된다.

### 4단계: linker와 annotation 연결

- taxonomy/catalog를 normalized-value의 single source of truth로 사용
- annotation dropdown에서 canonical item과 alias 검색 지원
- 알 수 없는 item은 현재처럼 새 normalized value 후보로 저장
- 새 값은 이후 catalog curation에서 brand, family, category, provenance 보강

현재 annotation DB에서 자동 성장한 normalized value를 버리지 않는다. catalog
migration 시 `source = reviewed_annotation` provenance를 가진 후보로 가져온다.

### 5단계: brand-aware candidate 생성

approved catalog의 alias를 기존 action template에 넣어 annotation candidate를
만든다.

```text
We're out of Coke Zero.       -> mark_out
Add Sprite to the list.       -> add_to_buy
Do we have any cola?          -> query_inventory
```

이 문장들은 여전히 synthetic candidate다. 사람이 검수하기 전에는 학습 정답이나
평가 정답으로 취급하지 않는다.

## 평가 설계

전체 record를 무작위 분할하면 같은 상품의 alias나 거의 같은 package record가
train과 test에 동시에 들어가 leakage가 생긴다. 최소한 다음 slice를 분리한다.

- `seen_product_seen_alias`: 학습에서 본 상품과 표현
- `seen_product_unseen_alias`: 상품은 같지만 처음 보는 표현
- `unseen_product_known_family`: 처음 보는 상품, 이미 알려진 product family
- `catalog_unknown`: catalog에 없는 실제 사용자 item
- `generic_vs_specific`: `milk`와 `whole milk`, `soda`와 `Coke` 구분
- `ambiguous_household_match`: 하나의 generic mention에 inventory 후보가 여러 개

측정할 지표:

- entity span exact match
- canonical item linking accuracy
- top-k candidate recall
- category accuracy
- clarification precision/recall
- catalog coverage와 unknown rate
- source별 성능과 brand popularity별 성능

인기 브랜드가 많은 external catalog는 frequency bias를 만들 수 있다. aggregate
accuracy뿐 아니라 long-tail과 unseen-product 성능을 별도로 보고한다.

## 현재 taxonomy에서 해결할 문제

구현 전에 다음 불일치를 정리해야 한다.

- 현재 `soda`는 `beverage` 아래 product로 되어 있지만 브랜드 확장 시 category 또는
  product family 역할이 더 적절하다.
- 현재 `whole milk`는 `milk` alias지만 annotation convention은 `whole_milk`라는
  specific item을 요구한다.
- `brand_id`, `product_family_id`, variant, provenance가 없다.
- canonical merge와 deprecated ID redirect 규칙이 없다.
- `packages/contracts/src/index.ts`의 hardcoded normalized values와 taxonomy가
  중복된 지식원이 되어 drift할 수 있다.

따라서 Open Food Facts import보다 `grocery-v2` schema와 migration rule을 먼저
정의한다.

## 구현 순서

1. `grocery-v2` schema와 JSON Schema 작성
2. category, product family, brand, item, alias, provenance 관계 정의
3. `soda`, `milk`, `whole_milk` 같은 기존 충돌 migration 표 작성
4. taxonomy를 normalized-value의 single source로 사용할 API 경계 결정
5. Open Food Facts 100-500 concept filtered importer 작성
6. human curation report와 canonical merge 도구 작성
7. exact alias linker baseline 구현
8. brand-aware generated review candidates 생성
9. leakage-safe evaluation split과 catalog metrics 구현
10. 실제 오류가 확인된 뒤에만 fuzzy 또는 embedding linker 비교

## 현재 결정

- Open Food Facts 사용: **조건부 채택**
- 역할: product catalog, alias, category, provenance source
- intent/relevance 학습 데이터 역할: **채택하지 않음**
- 전체 database production import: **채택하지 않음**
- 초기 범위: curated English 100-500 product concepts
- branded mention annotation: full `ITEM` span
- 독립 `BRAND` entity: 기능 요구가 생길 때까지 보류
- 구현 선행 조건: `grocery-v2` schema와 라이선스·스키마 재확인
