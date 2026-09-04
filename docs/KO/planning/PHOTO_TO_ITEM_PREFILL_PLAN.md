# 사진 촬영 기반 Item Form Prefill 계획

## 1. 결정 요약

사진을 찍어 item form을 미리 채우는 기능은 Jangoing 범위 안에서 충분히
현실적이다. 다만 이 기능은 **사진 upload의 작은 연장선**이 아니라
**recognition proposal을 item draft에 연결하는 별도 vertical slice**로 취급해야
한다.

이 기능의 목표는 다음이다.

1. 사용자가 item 사진을 촬영한다.
2. 시스템이 item name, category, 일부 보조 필드 후보를 제안한다.
3. 제안값으로 form을 미리 채운다.
4. 사용자가 수정 후 저장한다.

핵심 원칙은 단순하다.

- 사진만으로 inventory event를 자동 생성하지 않는다.
- model 결과는 항상 editable draft이다.
- 사용자가 form을 최종 확인하기 전까지 inventory projection을 바꾸지 않는다.

## 2. 이 기능이 해결하는 문제

현재 item 입력의 가장 큰 마찰은 사용자가 다음을 직접 반복 입력해야 한다는 점이다.

- item 이름
- category
- 경우에 따라 unit
- 경우에 따라 expiry 관련 값

사진 기반 prefill은 이 중 일부를 줄일 수 있다. 특히 packaged item에서는
`barcode + OCR + catalog lookup` 조합이 단순 이미지 분류보다 실용적이다.

이 기능의 진짜 목적은 "사진으로 자동 인식" 자체가 아니라 다음 두 가지다.

1. 입력 시간을 줄인다.
2. 향후 vision recognition 학습과 평가를 위한 실제 capture/confirmation 데이터를
   만든다.

## 3. 현재 시스템과의 연결점

현재 프로젝트에는 이미 다음 기반이 있다.

- Inventory와 `Set Up My Fridge`에서 item photo를 붙이는 UX
- household-scoped `item_media` 저장 구조
- 사용자 확인 전에는 inventory를 자동 변경하지 않는 제품 철학

현재 계약 기준으로 item form이 다루는 핵심 필드는 다음이다.

- `item_name`
- `quantity`
- `unit`
- `location`
- `expiration_date`
- `low_threshold`
- `category`
- `thumbnail_url`

따라서 prefill 기능은 "새로운 item schema"를 만드는 것이 아니라, **이미 있는 form
필드 중 일부를 recognition 제안으로 먼저 채우는 기능**으로 설계하는 것이 맞다.

## 4. 현재 구현에서 바로 부족한 점

이 기능을 붙이려면 현재 구조에서 세 가지가 부족하다.

### 4.1 전용 add-item form 흐름

현재는 Inventory edit와 `Set Up My Fridge`는 있지만, "사진을 찍고 새 item draft를
바로 만든 뒤 form을 채운다"는 일반 add flow는 아직 약하다.

### 4.2 recognition request/response 계층

현재는 photo upload만 있고, 다음이 없다.

- recognition request id
- candidate list
- confidence
- evidence source
- user acceptance / rejection / replacement log

### 4.3 vision용 원본 또는 display-size variant

현재 저장 구조는 UI 썸네일 중심이다. 이후 OCR, barcode crop, catalog retrieval을
붙이려면 썸네일만으로는 한계가 있다. 최소한 다음 중 하나는 필요하다.

- 원본 이미지 보존
- 썸네일보다 큰 display variant 보존

단, 원본 보존은 별도 retention과 consent 정책 없이는 자동으로 열면 안 된다.

## 5. 권장 제품 범위

이 문서에서 제안하는 첫 범위는 **photo-to-draft prefill**이다.

### 포함

- 단일 item 사진 촬영
- square crop 또는 display crop
- vision/OCR/barcode 기반 후보 생성
- item form 일부 필드 prefill
- 사용자의 수동 수정
- 최종 확인 후에만 저장

### 제외

- 사진만으로 inventory 자동 생성
- 여러 item이 한 번에 있는 fridge scene 분석
- quantity 자동 추정
- low threshold 자동 계산
- spoilage 자동 판정
- expiry 자동 확정

## 6. 권장 사용자 흐름

### 6.1 새 item 추가

```text
Add Item
→ Take Photo
→ crop preview
→ recognition request
→ top candidate / OCR text / barcode result 수신
→ item form prefill
→ 사용자 수정
→ Save
→ inventory event 생성
```

이 흐름에서 가장 중요한 점은 **recognition 결과가 form을 여는 트리거이지, 저장을
대신하는 것이 아니라는 점**이다.

### 6.2 Set Up My Fridge draft

```text
빈 draft row
→ 사진 촬영
→ crop
→ candidate 제안
→ name/category/unit 일부 prefill
→ 사용자가 quantity/location/expiry 확인
→ setup save
```

이 흐름은 현재 fridge setup 구조와 가장 잘 맞는다. 이미 row draft와 photo draft가
있기 때문에, 가장 먼저 확장하기 쉬운 곳이다.

### 6.3 기존 item 편집

기존 inventory item의 photo replace는 **artwork 갱신**과 **recognition 기반
metadata suggestion**을 분리하는 것이 좋다.

- photo replace만 원하면 recognition을 강제하지 않는다.
- recognition은 "suggest update"로 별도 요청한다.

## 7. 어떤 필드를 prefill할 것인가

모든 form 필드를 같은 수준으로 다루면 안 된다.

### 7.1 우선 prefill해도 되는 필드

- `item_name`
  - 최종 canonicalization 전 사용자 표시 이름 후보로 사용
- `category`
  - packaged / dairy / produce 정도의 coarse category는 후보로 유용함
- `unit`
  - label이나 catalog에서 명확할 때만 약하게 제안

### 7.2 후보로만 보여야 하는 필드

- `expiration_date`
  - OCR 결과를 바로 확정하지 말고 candidate로만 보여야 함
- `brand`
  - 현재 core inventory schema에는 없으므로 form helper 정보로만 먼저 노출 가능
- `barcode`
  - debug/evidence 용도로는 유용하지만 inventory 핵심 필드는 아님

### 7.3 자동 prefill하지 말아야 하는 필드

- `quantity`
  - 기본값 `1` 유지가 안전함
- `location`
  - 사용자의 보관 위치는 사진만으로 신뢰하기 어려움
- `low_threshold`
  - household usage 패턴에 가까운 값이므로 비전으로 추정하지 않음

## 8. 추천 recognition 전략

첫 버전은 "이미지 classifier"보다 **signal fusion**이 더 적합하다.

권장 순서:

1. barcode decode
2. OCR text extraction
3. general vision candidate
4. catalog lookup
5. household/item history로 rerank

이 순서를 택하는 이유는 grocery item에서는 packaging text와 barcode가 image-only
classification보다 더 안정적인 경우가 많기 때문이다.

## 9. 제안 API 형태

### 9.1 recognition 요청

```text
POST /recognition-requests
```

요청은 다음 중 하나를 참조한다.

- 업로드 직전의 photo blob
- 이미 저장된 media id

### 9.2 recognition 응답 예시

```json
{
  "request_id": "uuid",
  "prefill": {
    "display_name": "Greek Yogurt",
    "canonical_item_name": "greek_yogurt",
    "category": "dairy_eggs",
    "unit": "cup",
    "expiration_date_candidate": null
  },
  "candidates": [
    {
      "display_name": "Greek Yogurt",
      "canonical_item_name": "greek_yogurt",
      "confidence": 0.84,
      "evidence": ["barcode", "ocr", "catalog"]
    }
  ],
  "ocr_text": ["GREEK", "YOGURT"],
  "barcode": "0123456789012",
  "requires_confirmation": true
}
```

## 10. 저장 및 로깅 권장 구조

### 10.1 media

장기적으로는 `item_media`에 다음 개념이 구분되어야 한다.

- `thumbnail` variant
- `display` variant
- 필요 시 `original` variant

### 10.2 recognition request log

별도 테이블 또는 로그 레이어에 다음을 남기는 것이 좋다.

- `recognition_request_id`
- media reference
- model/version
- top-k candidates
- evidence source
- chosen value
- manual override 여부
- dismissed / unknown 여부
- latency

이 로그는 이후 모델 평가와 product quality review에 필수다.

## 11. 개인정보와 동의

이 기능은 단순 artwork보다 privacy 요구가 높다.

반드시 분리해야 하는 동의는 다음 두 가지다.

1. 사진을 item artwork로 저장하는 동의
2. 사진 또는 recognition 결과를 모델 개선에 사용하는 동의

두 동의를 합치면 안 된다. 또한 원본 보존을 열 경우에는 다음이 문서화되어야 한다.

- 어떤 variant를 저장하는지
- EXIF 제거 여부
- 삭제 시 R2와 D1에서 어떻게 전파되는지
- retention 기간
- export / deletion 요청 경로

## 12. 구현 단계 제안

### Phase 0: contract와 privacy gate

- recognition request/response schema 정의
- consent / retention 정책 초안 작성
- 원본 저장 여부 결정

### Phase 1: fridge setup prefill pilot

- existing draft row에서 사진 촬영
- crop 후 recognition 요청
- `name/category/unit`만 prefill
- 사용자가 나머지 필드 확인

이 단계는 가장 리스크가 낮고 현재 구조와 가장 잘 맞는다.

### Phase 2: dedicated add-item flow

- Add Item 진입점 추가
- 사진에서 새 item draft 생성
- top-k candidate confirmation UI 추가

### Phase 3: OCR/barcode/catalog 개선

- barcode decode baseline
- OCR text extraction baseline
- catalog retrieval 연결
- evidence별 ablation 평가

### Phase 4: adaptation과 평가

- household-specific reranking
- correction log 분석
- frozen evaluation set 구성

## 13. 성공 기준

첫 버전의 성공 기준은 "자동 인식 정확도" 하나가 아니다.

- 사용자가 item form을 더 빨리 완성하는가
- manual typing 비율이 줄어드는가
- candidate dismissal이 지나치게 높지 않은가
- 잘못된 prefill이 오히려 입력을 방해하지 않는가
- recognition이 inventory event를 잘못 자동 생성하지 않는가

## 14. 권장 결론

사진 촬영으로 item form을 미리 채우는 기능은 **지금 프로젝트에서 충분히 해볼 수
있는 다음 단계**다. 하지만 다음 전제가 필요하다.

- recognition은 draft prefill이어야 한다.
- inventory write는 계속 사용자 확인 뒤에만 일어나야 한다.
- 원본/고해상도 variant 보존 여부를 privacy와 함께 먼저 결정해야 한다.

가장 좋은 첫 구현은 **`Set Up My Fridge` draft row에 사진 기반 prefill pilot을
붙이는 것**이다. 그 다음에 일반 Add Item flow로 확장하는 순서가 맞다.
