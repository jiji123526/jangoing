# Jangoing Action Items

Last updated: 2026-09-01

이 문서는 annotation infrastructure에서 English NLP MVP로 넘어가기 위한 운영
체크리스트다. [PLAN.md](./PLAN.md)는 더 넓은 제품 로드맵을 설명하고, 이 문서는
당장 처리할 concrete deliverable과 completion gate를 추적한다.

## 현재 상태

- [x] Item별 low threshold와 quantity 기반 Low/Out status 추가
- [x] 자연어 `set_low_threshold` parsing과 annotation support 추가
- [x] D1 migration `0009` 적용 및 inventory threshold update 배포
- [x] Worker, local API, Home에 atomic guided initial-fridge setup 구현
- [x] D1 migration `0010` 적용 및 Vercel보다 먼저 fridge setup Worker 배포
- [ ] wider use 전에 production setup 한 건을 실제 household로 검증
- [x] Inventory item editing에 optional controlled category override 추가
- [ ] Migration `0011` 적용, category-aware Worker 배포, Web 재배포
- [x] Artwork-first, vision-later item media architecture 정의
- [ ] Production media upload endpoint를 열기 전에 authentication 또는 제한된 household upload token 선택
- [ ] Upload security gate 이후에만 R2/D1 item media storage 구현
- [x] 원래 `reference_date`, `timezone`, inference timestamp 저장
- [x] Relative expiry language를 deterministic shared code로 normalize
- [x] Assistant expiry proposal을 original inference context에 grounding
- [x] Expiry queue에 temporal context와 normalized suggestion 표시
- [x] Overwrite하지 않는 temporally explicit annotation queue seed v2 추가
- [x] Relevance queue와 reviewed relevance export 추가
- [x] Temporal change와 seed v2를 production에 배포
- [x] 첫 text dataset composition, source policy, freeze gate 정의
- [ ] Reviewed distribution reporting과 source-aware dataset export 추가
- [ ] Gap-targeted `synthetic-v2` candidate 생성
- [ ] First human-data baseline에 필요한 reviewed English data 수집

## 1. 현재 변경사항 적용

- [x] Temporal commit을 `main`에 push
- [x] Cloudflare Worker 배포
- [x] `annotation-queue-seed-v2`를 production D1에 seed
- [x] Updated annotation UI를 Vercel에 배포
- [ ] Expiry queue sample 하나를 열어 Temporal context card 검증
- [ ] `tomorrow`가 현재 annotation date가 아니라 표시된 reference date 기준으로 normalize되는지 확인
- [ ] D1에서 v1과 v2 row count 비교
- [ ] v2를 확인한 뒤 필요하면 annotation되지 않은 v1 seed row만 제거

```bash
cd /home/jjiwoo/.workspace/jangoing

git push origin main
npm run deploy:api
npm run annotation:seed-queues -- --remote
```

Temporal change 자체는 migration이 필요 없다. 이후 inventory threshold update는
Worker 배포 전에 migration `0009`가 필요하다.

## 2. Annotation milestone

아래 count는 raw generated candidate가 아니라 human-reviewed record 기준이다.
Generated label과 AI draft는 annotator가 검토 후 저장하기 전까지 count에 포함하지
않는다.

### Gate A: Workflow pilot

목표: reviewed training candidate 300개, evaluation candidate 100개.

- [ ] 현재 사용하는 각 queue에서 최소 30개씩 검토
- [ ] 반복되는 ambiguity를
  [ANNOTATION_CONVENTIONS.md](../annotation/ANNOTATION_CONVENTIONS.md)에 기록
- [ ] Expiry, normalized item value, multi-action record, relevance label이 모두 수동 DB repair 없이 저장되는지 확인
- [ ] Random annotation 50개를 audit해 span boundary와 normalized value 검토
- [ ] 이 gate에서는 production candidate를 학습하지 말고 collection workflow를 고친다

### Gate B: First human-data baseline

목표: reviewed training candidate 1,000개, evaluation candidate 200개.

- [ ] 지원하는 모든 actionable intent 포함
- [ ] Reviewed relevance와 intent distribution이
  [TEXT_DATASET_DESIGN_V1.md](../ml/TEXT_DATASET_DESIGN_V1.md) 정의와 맞도록 수집
- [ ] 각 supported intent마다 reviewed training 예시 최소 40개, 흔한 state-changing intent는 50-80개 확보
- [ ] `domain_non_actionable`을 `unrelated`보다 크게 유지
- [ ] Evaluation record가 generated template variation이 아니라 independent writing 또는 actual user data에서 오도록 보장
- [ ] Phrase family 기준으로 development 100개, final-test 100개 freeze
- [ ] TF-IDF relevance와 single-intent baseline 학습
- [ ] 결과 metric은 baseline으로만 보고 MVP launch gate로 쓰지 않음

### Gate C: English MVP dataset

목표: reviewed training candidate 3,000-5,000개, independent evaluation
candidate 최소 500개.

- [ ] 각 common intent마다 200-300개 확보
- [ ] Reviewed `ITEM` span 최소 1,000개 수집
- [ ] 여러 phrase family와 calendar context에 걸친 reviewed `EXPIRY_DATE` span 300-500개 수집
- [ ] Product가 필요로 하는 경우 quantity, unit, location, category 각각 최소 300개 수집
- [ ] Spelling error, indirect request, contraction, generic item mention,
  product subtype, multi-action utterance 포함
- [ ] TF-IDF와 DistilBERT-class intent/relevance model 비교
- [ ] Token-classification slot model 학습 및 평가
- [ ] Per-class와 per-entity error analysis 후에만 모델 선택

### 이후 안정화 목표

목표: reviewed record 8,000-15,000개. Uniform synthetic expansion이 아니라
production error에 의해 증가해야 한다.

- [ ] Real correction, low-confidence traffic, new phrase family 우선
- [ ] Evaluation error가 measurable gap을 보이는 곳에만 data 추가
- [ ] Intent, entity, phrase family, input source별 성능 모니터링

## 3. Annotation 우선순위

Gate B까지는 다음 순서를 따른다.

1. 먼저 production distribution snapshot을 떠서 어떤 queue가 부족한지 확인
2. `expiry`: temporal context 검증과 `EXPIRY_DATE` coverage 확보
3. `domain_non_actionable`: grocery-domain hard negative 수집
4. `preference_context`: persistent context와 immediate action 분리
5. `generated_review`: v1은 선택적으로 쓰고, 이후 targeted v2 gap을 우선
6. `low_confidence`: 어려운 예시와 ambiguous example 수집
7. `correction`, `confirmed_unannotated`: actual user traffic 보존
8. `evaluation_holdout`: independent natural record 위주로 쓰고 synthetic test는 피함

AI draft는 annotation을 미리 채울 수는 있지만, human-reviewed saved annotation만
ground truth다.

## 4. Dataset quality gate

모델 비교 전에 항상 아래를 확인한다.

- [ ] Exact duplicate utterance 제거
- [ ] Near-duplicate template와 alias-only variation 탐지
- [ ] Phrase family가 frozen train/evaluation split을 넘지 않도록 유지
- [ ] Class와 entity-span distribution 보고
- [ ] 필요한 normalized value가 모두 채워졌는지 확인
- [ ] Relative date를 저장된 temporal context 기준으로 검증
- [ ] Generated source metadata를 유지해 synthetic와 actual-user 성능을 분리 보고
- [ ] Reproducible experiment를 위해 dataset hash와 manifest freeze
- [ ] Relative temporal language 의미로 annotation time을 절대 사용하지 않음

## 5. Export와 학습

Reviewed production record export:

```bash
cd /home/jjiwoo/.workspace/jangoing

npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl

npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl

npm run dataset:export -- --remote --task slots \
  --train-output ml/data/reviewed-slots-train.jsonl \
  --evaluation-output ml/data/reviewed-slots-evaluation.jsonl
```

현재 baseline 학습:

```bash
source ml/.venv/bin/activate
python ml/train_baseline.py ml/data/reviewed-train.jsonl
pytest ml/tests
```

새 모델을 받아들이기 전에:

- [ ] 이전 frozen evaluation set과 비교
- [ ] Per-class precision, recall, F1, confusion matrix 검토
- [ ] Entity exact-span error와 normalized-value error를 분리 검토
- [ ] Dataset hash, Git commit, random seed, model artifact version 기록
- [ ] Aggregate accuracy 하나만 보고 promotion하지 않음

## 다음 즉시 작업

Production expiry annotation을 end to end로 하나 검증한 뒤, aggressive하게 dataset을
늘리기 전에 300/100 workflow pilot을 먼저 끝낸다.

## Product catalog track

이 track은 첫 intent/relevance baseline과 독립적이다. 큰 external catalog import 때문에
현재 annotation milestone을 늦추지 않는다.

- [ ] Current Open Food Facts schema와 license obligation을 공식 dataset 문서로 확인
- [ ] Category, product family, brand, item, alias, provenance, canonical lifecycle을 위한 versioned `grocery-v2` schema 정의
- [ ] Inventory category override event를 provenance-preserving item-category relation evidence로 변환
- [ ] 반복되는 `Other` item을 immediate global ground truth로 취급하지 않는 household-scoped `Suggest category` proposal flow 정의
- [ ] `soda`, `milk`, `whole_milk` 같은 현재 conflict에 대한 migration decision 작성
- [ ] Catalog와 hardcoded normalized-value seed 사이의 taxonomy knowledge duplication 제거
- [ ] Filtered importer로 100-500개의 curated English product concept 구축
- [ ] Fuzzy retrieval이나 embedding 전에 exact-alias entity-linking baseline 구현
- [ ] Seen-product, unseen-alias, unseen-product, catalog-unknown evaluation slice 추가

근거와 safeguard는
[OPEN_FOOD_FACTS_BRAND_STRATEGY.md](../ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md)에
있다.
