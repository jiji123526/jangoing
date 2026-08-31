# Item Media와 Vision Recognition 계획

## 1. 결정 요약

Jangoing의 사용자 촬영 사진은 두 단계로 사용한다.

1. **현재 목표: artwork**
   - 사용자가 Inventory 또는 초기 fridge setup에서 item 사진을 촬영한다.
   - 사진을 해당 canonical `item_name`의 primary artwork로 저장한다.
   - Inventory, Home Recently Updated, Search, Shopping List에서 재사용한다.
   - 사진은 inventory quantity나 상태를 자동으로 바꾸지 않는다.
2. **궁극 목표: vision recognition**
   - 같은 촬영 흐름에서 item, brand, category, condition 후보를 제안한다.
   - barcode와 OCR을 별도 signal로 결합할 수 있다.
   - 모델 결과는 항상 reviewable proposal이며 사용자 확인 전에는 inventory
     event를 만들지 않는다.

이 순서를 택하는 이유는 사진 저장과 rendering만으로 즉시 UX 가치가 생기고,
동시에 향후 vision model에 필요한 실제 촬영 분포와 confirmation feedback을
안전하게 설계할 수 있기 때문이다.

## 2. 제품 원칙

- 사진 upload와 vision recognition을 하나의 feature로 묶지 않는다.
- image bytes는 R2, searchable metadata와 item 관계는 D1에 저장한다.
- 사진은 canonical item에 연결하되 사용자가 보는 구체적 item 이름을 보존한다.
- 사용자가 촬영하지 않은 item은 기존 category gradient artwork를 사용한다.
- model confidence가 높아도 inventory를 자동 변경하지 않는다.
- 사용자 사진을 model training에 자동 사용하지 않는다. 별도 동의와 retention
  정책이 필요하다.
- CORS는 인증이 아니다. production upload endpoint는 인증 또는 제한된
  household upload token 없이는 공개하지 않는다.
- EXIF와 위치 metadata를 저장하지 않는다.

## 3. 범위

### Phase 1에 포함

- 휴대폰 camera 또는 photo library에서 한 장 선택
- client-side orientation correction, resize, crop preview, WebP/JPEG 재인코딩
- 사용자 사진 upload, replace, remove
- item별 primary artwork 한 장
- Inventory, Home, Search, Shopping List artwork fallback chain
- file type, decoded image, dimensions, byte size 검증
- upload rate limit과 ownership 검증

### Phase 1에서 제외

- 사진만으로 item 자동 추가
- 여러 물체가 있는 fridge 전체 사진 분석
- 수량 자동 계산
- expiry date 자동 확정
- condition 또는 spoilage 자동 판정
- 사용자 사진을 이용한 model fine-tuning
- 공개 gallery 또는 household 간 사진 공유

## 4. Artwork 사용자 흐름

### Inventory

```text
Edit
→ item 선택
→ Add Photo 또는 Change Photo
→ Take Photo / Choose from Library
→ square crop preview
→ Save
→ primary artwork 갱신
```

사진 변경은 quantity, expiry, threshold 편집과 독립적으로 실패하거나 재시도할
수 있어야 한다. inventory event 저장 성공 여부와 image upload 성공 여부를
불필요하게 하나의 transaction으로 묶지 않는다.

### Set Up My Fridge

초기 setup에서는 각 item에 optional photo draft를 붙일 수 있다. 그러나 setup의
atomic inventory 저장을 image upload에 의존시키지 않는다.

권장 순서:

1. 브라우저에서 사진 preview와 local draft를 유지한다.
2. fridge setup event transaction을 먼저 완료한다.
3. 성공한 canonical item에 사진을 upload한다.
4. 일부 사진 upload가 실패하면 setup은 유지하고 실패한 사진만 재시도한다.

### 표시 우선순위

```text
사용자 primary photo
→ 검증된 external catalog photo
→ category gradient artwork
```

동일한 primary image를 다음 frame에 맞게 사용한다.

- Inventory artwork: `102×102px`
- Home Recently Updated: `160×160px`
- Home attention 또는 compact row: `48×48px`
- Shopping/Search result: `48×48px`

원본을 매번 내려받지 않도록 thumbnail variant를 사용한다.

## 5. 저장 구조

### R2

권장 object key:

```text
households/{household_id}/items/{item_name}/{media_id}/display.webp
households/{household_id}/items/{item_name}/{media_id}/thumb.webp
```

MVP가 single-household여도 key에 household namespace를 포함한다. 이후 인증을
추가할 때 object migration을 피할 수 있다.

권장 image output:

- display: 긴 변 최대 `1200px`, WebP quality 약 `0.80`
- thumbnail: square `480×480px`, WebP quality 약 `0.78`
- 업로드 후 총 허용 크기: 파일당 최대 `1MB`
- animation, SVG, arbitrary binary upload는 허용하지 않음

Vision input을 위해 무제한 원본을 보존하지 않는다. 향후 모델이 더 높은 해상도를
요구하면 명시적인 retention 정책과 함께 별도 variant를 추가한다.

### D1 migration 초안

예상 migration은 `0011_create_item_media.sql`이다.

```sql
CREATE TABLE item_media (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  display_object_key TEXT NOT NULL,
  thumbnail_object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  source TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_item_media_household_item
  ON item_media(household_id, item_name);

CREATE UNIQUE INDEX idx_item_media_one_primary
  ON item_media(household_id, item_name)
  WHERE is_primary = 1;
```

`source` 초기 값:

- `user_capture`
- `user_library`
- `external_catalog`

사진은 inventory event payload에 넣지 않는다. `item_media`는 item presentation
metadata이며 quantity/state projection을 변경하지 않는다. 필요하면 upload와
delete audit event를 별도 media audit table에 남긴다.

## 6. API 초안

### Artwork API

```text
GET    /item-media?item_names=milk,oat_milk
POST   /items/{item_name}/media
DELETE /items/{item_name}/media/{media_id}
POST   /items/{item_name}/media/{media_id}/primary
```

초기 MVP에서는 browser에서 최대 1MB로 처리한 `multipart/form-data`를 Worker가
검증해 R2로 전달할 수 있다. 규모가 커지면 upload intent와 짧은 수명의 signed
upload URL 방식으로 전환한다.

GET 응답은 object key를 노출하기보다 사용 가능한 media URL과 dimensions,
version을 반환한다. URL 또는 `updated_at`을 cache key에 포함해 교체 직후 오래된
이미지가 남지 않게 한다.

### 필수 server validation

- 인증된 household가 item에 접근할 수 있는지 확인
- request body와 decoded image 모두 크기 제한
- 허용 MIME: `image/jpeg`, `image/webp`, 필요 시 `image/png`
- magic bytes와 실제 decode 결과 확인
- width/height 상한 확인
- re-encode를 통해 EXIF 제거
- 동일 hash 중복 upload 처리
- per-household rate limit
- D1 write 실패 시 생성된 R2 object cleanup
- R2 delete 실패 시 cleanup retry 대상 기록

## 7. 인증과 개인정보 gate

현재 one-household MVP에는 사용자 인증이 없다. `ALLOWED_ORIGINS`와 CORS만으로는
upload endpoint를 보호할 수 없다.

Phase 1 production 전에 다음 중 하나가 필요하다.

### 권장

- account authentication
- request에서 server-side household ownership 확인
- household별 R2 prefix와 D1 row 격리

### 제한적 임시안

- server에서 발급한 회전 가능한 household upload token
- token hash만 server에 저장
- 짧은 expiry, rate limit, revoke 지원

임시 token은 multi-user authorization의 대체가 아니다. public demo에서 upload를
열어야 한다면 authenticated account가 준비될 때까지 photo feature를 feature
flag 뒤에 둔다.

개인정보 정책에는 다음을 명시한다.

- 어떤 image variant를 저장하는지
- EXIF 제거 여부
- 삭제 시 R2와 D1에서 언제 제거되는지
- training 사용 여부
- 사용자가 export와 deletion을 요청하는 방법

## 8. Vision Recognition 진화 계획

### Phase 2: Pretrained proposal

사용자가 사진을 선택한 후 upload 전 또는 후에 recognition을 요청한다.

```text
photo
→ vision/OCR/barcode signals
→ candidate list
→ user confirmation
→ normal inventory setup/update flow
```

응답 contract 예시:

```json
{
  "request_id": "uuid",
  "candidates": [
    {
      "item_name": "coke_zero",
      "generic_item": "soda",
      "brand": "coca_cola",
      "category": "beverage",
      "confidence": 0.84,
      "evidence": ["visual", "ocr"]
    }
  ],
  "expiry_candidates": [],
  "requires_confirmation": true
}
```

초기에는 general vision API 또는 pretrained image-text embedding을 이용해
candidate를 만들 수 있다. 이 단계에서도 vision output을 annotation ground
truth로 취급하지 않는다.

### Phase 3: Catalog retrieval

Open-world grocery item은 고정 class classifier보다 catalog retrieval이
적합하다.

1. image embedding 생성
2. curated product/catalog image embedding과 nearest-neighbor 검색
3. OCR brand/product text와 barcode 결과 결합
4. Jangoing canonical taxonomy로 entity linking
5. top-k 후보를 사용자에게 제시

Open Food Facts는 product name, brand, barcode, category, image 후보를 위한
catalog로만 사용한다. 이미지 license와 attribution을 별도로 검증하고,
utterance intent ground truth로 사용하지 않는다.

### Phase 4: Jangoing-specific adaptation

충분한 동의 기반 데이터가 생기면 다음을 비교한다.

- frozen pretrained embedding + nearest-neighbor retrieval
- lightweight classifier head
- multimodal ranker: image + OCR + barcode + household history
- Raspberry Pi 또는 mobile-compatible ONNX model

custom training은 common class만 맞히는 closed classifier가 아니라 unknown
item을 거절하고 후보를 잘 정렬하는 방향이어야 한다.

## 9. Vision label 수집

사용자가 후보를 확인할 때 다음을 기록한다.

```text
recognition_request_id
model/version
top-k candidates and scores
selected canonical item
selected brand/category
manual replacement
dismissed/unknown
latency
image consent scope
```

중요:

- UI 확인 결과와 training consent를 분리한다.
- artwork 저장 동의가 model training 동의를 의미하지 않는다.
- evaluation split은 같은 사진의 resize/crop variant가 train과 겹치지 않게
  image hash 또는 capture group 기준으로 분할한다.
- 같은 household, product, 촬영 session leakage를 검사한다.
- external catalog image와 실제 냉장고 촬영 사진을 별도 domain slice로 평가한다.

## 10. 평가 지표

### Artwork

- upload success rate
- median upload latency
- browser compression failure rate
- broken media URL rate
- replace/delete consistency
- page image transfer bytes와 LCP 영향

### Recognition

- top-1 accuracy
- top-3 recall
- mean reciprocal rank
- unknown-item rejection precision/recall
- confidence calibration
- manual replacement rate
- brand, generic item, category별 정확도
- barcode/OCR/image signal별 ablation
- packaged, produce, frozen, reflective, occluded image slice

expiry OCR은 일반 item recognition과 별도 task로 평가한다. 날짜를 읽었다고
유통기한임을 확정할 수 없으므로 date type과 temporal normalization 확인이
필요하다.

## 11. 단계별 실행 계획

### Phase 0: Security and contract

- [ ] authentication 또는 제한된 household token 방식 결정
- [ ] photo retention, deletion, training consent 정책 작성
- [ ] `ItemMedia` contract와 API error schema 정의
- [ ] R2 lifecycle과 cache 정책 결정

완료 조건: 공개 endpoint가 household ownership 없이 object를 쓰거나 읽을 수
없다.

### Phase 1A: Storage

- [ ] Cloudflare R2 bucket과 Worker binding 추가
- [ ] migration `0011_create_item_media.sql` 작성
- [ ] upload/read/delete API 구현
- [ ] MIME, decode, dimension, byte, hash 검증
- [ ] D1/R2 partial failure cleanup 테스트

완료 조건: 한 item의 primary image를 저장, 조회, 교체, 삭제할 수 있고 orphan
object가 남지 않는다.

### Phase 1B: Artwork UX

- [ ] Inventory edit에 Add/Change/Remove Photo 추가
- [ ] client-side orientation correction, crop, resize, re-encode 추가
- [ ] Set Up My Fridge에 optional photo draft 추가
- [ ] Home, Inventory, Search, Shopping에 image fallback chain 적용
- [ ] loading, upload progress, retry, error, offline 상태 구현
- [ ] responsive image size와 cache invalidation 검증

완료 조건: 사용자 사진이 네 consumer surface에서 일관되게 보이며 사진 실패가
inventory action을 손상시키지 않는다.

### Phase 2: Vision prototype

- [ ] recognition request/response schema 정의
- [ ] general vision 또는 pretrained embedding baseline 구축
- [ ] top-k confirmation UI 구현
- [ ] prediction, correction, dismissal logging 추가
- [ ] vision 결과가 직접 inventory event를 만들지 않는지 테스트

완료 조건: 사진으로 후보를 제시하고 사용자가 확인하거나 직접 대체할 수 있다.

### Phase 3: Retrieval and evaluation

- [ ] curated grocery catalog와 image license 검증
- [ ] catalog embedding index 구축
- [ ] image + OCR + barcode fusion baseline 비교
- [ ] frozen evaluation set과 domain slice 구성
- [ ] top-k, unknown rejection, calibration report 작성

완료 조건: 단순 vision API 대비 개선을 재현 가능한 평가로 입증한다.

### Phase 4: Edge deployment research

- [ ] Raspberry Pi/mobile latency와 memory budget 정의
- [ ] candidate encoder/ranker ONNX export 검증
- [ ] cloud, phone, Raspberry Pi privacy/latency/cost 비교
- [ ] fallback과 model version rollback 설계

## 12. 권장 구현 순서

현재 우선순위는 다음과 같다.

1. fridge setup과 annotation MVP 안정화
2. authentication 또는 household upload token
3. R2/D1 item media storage
4. Inventory 한 화면에서 photo artwork pilot
5. Home/Search/Shopping으로 artwork 확대
6. recognition proposal prototype
7. 동의 기반 correction data가 쌓인 뒤 custom adaptation

사진 recognition부터 시작하지 않는다. 먼저 storage, consent, confirmation,
evaluation 구조를 만들어야 vision 결과를 안전하게 제품과 연구 데이터에 연결할
수 있다.
