# Production Annotation 화면 사용 및 의사결정 기록

## 목적

`/annotate`는 실제 영어 문장을 학습·검증 데이터로 라벨링하기 위한 별도 화면이다.
일반 주방 UI와 분리해 intent, 원문 entity span, 정규화 값, 데이터 용도를 정확히
기록하는 데 집중한다.

이 문서는 화면 사용법과 운영 결정을 설명한다. 실제 intent/entity/normalization을
어떻게 결정할지는 `ANNOTATION_CONVENTIONS_KO.md`를 기준으로 한다.

## 접근 위치

```text
https://<vercel-domain>/annotate
```

홈 화면 상단의 `Annotate` 링크로도 이동할 수 있다.

화면 상단 진행 카드는 production DB의 목적별 저장 수를 보여준다.

- Training candidates: 초기 목표 `100–200`
- Evaluation candidates: 초기 목표 `100+`

저장 직후 선택한 purpose의 카운터가 증가하며, 새로고침하면 production 집계값을 다시
불러온다. 목표치는 초기 데이터 수집 가이드이며 품질이나 intent별 균형을 대신하지 않는다.

## 사용 순서

1. 실제로 말할 법한 영어 문장을 직접 입력하거나 queue 버튼으로 기존 inference
   샘플 하나를 불러온다. 직접 입력 후에는 `Enter` 또는 `Create`를 누른다.
   줄바꿈이 필요하면 `Shift + Enter`를 사용한다.
2. 규칙 기반 parser의 예측을 참고해 첫 action의 intent를 선택한다.
3. 문장에 별도 요청이 더 있으면 `Add action`으로 action을 추가하고 intent를 고른다.
4. 라벨링할 action을 활성화한 뒤 원문에서 entity 단어를 드래그한다.
5. ITEM, CATEGORY, QUANTITY, UNIT, LOCATION, EXPIRY_DATE 중 label을 선택한다.
6. label별 dropdown에서 canonical/normalized 값을 선택한다. EXPIRY_DATE는 날짜
   선택기를 사용한다.
7. 각 action에서 intent별 phrase family를 선택한다.
8. Training candidate 또는 Evaluation candidate를 고른다.
9. 모호성이나 라벨 판단 근거가 있으면 notes에 기록한다.
10. `Save annotation`을 누른다.

## Queue 버튼

`/annotate`는 새 문장을 직접 만드는 것 외에 우선순위 queue에서 샘플을 하나씩
불러올 수 있다.

- `Load correction queue`: 사용자가 이미 correction을 남긴 문장
- `Load expiry queue`: 날짜/유통기한 표현이 들어간 문장
- `Load low-confidence queue`: confidence가 낮거나 `unknown`,
  `needs_clarification`에 가까운 문장
- `Load confirmed queue`: 실사용에서 맞았고 confirmed된 문장
- `Load evaluation holdout`: evaluation 후보로 분리하려는 reviewed 문장

queue에서 불러온 샘플은 해당 raw text와 예측값을 기반으로 편집한다. correction이
이미 저장된 샘플이면 reviewed intent가 기본 intent 선택에 반영된다. evaluation
holdout 샘플은 dataset purpose도 기본적으로 `Evaluation candidate`로 선택된다.

## 여러 intent/action 라벨링

annotation-v2는 한 발화 안의 요청을 action group으로 저장한다.

```text
Add milk to the list and throw away the spinach.
```

- Action 1: `add_to_buy`, entity `milk`
- Action 2: `throw_away`, entity `spinach`

각 action은 자체 intent, phrase family, entities, normalized object를 가진다. entity를
추가하기 전에 반드시 올바른 action이 활성화됐는지 확인한다. 같은 원문 span이 실제로
두 action 모두에 필요하면 action별로 반복 선택할 수 있다. 한 action 안에서는 span을
겹치게 저장할 수 없다.

단순히 목적어가 여러 개인 한 행동은 가능한 한 하나의 action으로 다루되, 서로 다른
실제 처분이나 독립 정답으로 분리해야 한다면 같은 intent의 action을 여러 개 만들 수
있다. 판단이 어려우면 notes에 근거를 남긴다.

## 저장 구조

마이그레이션 `0004_create_annotations.sql`이 `annotations` 테이블을 만들고,
`0005_add_annotation_actions.sql`이 action-group 저장 필드를 추가한다.

저장 값:

- 연결된 inference ID
- action별 최종 intent와 phrase family
- action별 entity label, 문자 start/end, 원문 text, normalized value
- action별 normalized object
- train/evaluation 후보 구분
- phrase family
- notes와 annotator
- annotation schema version(`annotation-v2`)과 생성 시간

동일 inference는 한 번만 annotation할 수 있다. API는 entity span이 실제 원문과
일치하는지, span끼리 겹치지 않는지 다시 검증한다.

## 공개 production 화면 결정

사용자 요청에 따라 로그인 없이 production에 노출한다. 다음 위험이 있다.

- 제3자가 임의의 annotation을 저장할 수 있다.
- 악의적이거나 품질이 낮은 라벨이 데이터에 섞일 수 있다.
- API 호출량과 D1 쓰기량이 증가할 수 있다.

위험을 줄이기 위해 기존 production 대화 원문을 자유 탐색하는 공개 브라우징 화면은
만들지 않았다. 대신 workflow에 필요한 경우만 queue에서 우선순위가 높은 샘플
하나를 불러온다. 공개 통계는 전체 저장 개수만 반환하고, 대화 원문을 페이지네이션
형태로 열람하는 기능은 제공하지 않는다.

실제 사용자가 늘어나면 인증, rate limit, CSRF/abuse 방어, annotator identity,
review status를 추가해야 한다.

## Training과 Evaluation candidate

### Training candidate

모델이 학습해도 되는 후보 문장이다. 유사 표현이나 의도적인 variation을 포함할
수 있다.

### Evaluation candidate

모델 일반화를 평가할 독립적인 실제 표현 후보다. 기존 template를 단어만 바꾼
문장을 넣지 않는다. 후보로 표시했다고 즉시 frozen test가 되는 것은 아니다.
중복 제거와 사람 검토 후 별도의 frozen test manifest로 확정해야 한다.

## Entity span 규칙

- 정확히 원문에 보이는 글자만 선택한다.
- 앞뒤 공백과 문장부호는 의미가 없으면 제외한다.
- 서로 겹치는 span은 만들지 않는다.
- `drinks`처럼 상위 개념이면 ITEM이 아니라 CATEGORY를 사용한다.
- normalized value에는 canonical ID를 사용한다.

## Normalized value 선택 메뉴

annotation-v2는 자유 입력 대신 label별 controlled vocabulary를 사용한다.

- ITEM과 CATEGORY: `ml/taxonomy/grocery-v1.json`의 canonical ID
- QUANTITY: 초기 지원 수량 목록의 숫자 값
- UNIT: 단수형 영문 canonical unit
- LOCATION: API contract가 지원하는 `fridge`, `freezer`, `pantry`
- EXPIRY_DATE: ISO 날짜를 만드는 날짜 선택기

목록에 필요한 값이 없다면 비슷한 값을 임의로 고르지 않는다. normalized value를
비워 두고 notes에 필요한 후보를 기록한 다음 taxonomy/convention을 먼저 확장한다.

## Phrase family 선택 메뉴

Phrase family도 자유 입력하지 않고 선택한 intent에 맞는 controlled list에서 고른다.
intent를 변경하면 이전 family 선택은 자동으로 초기화된다. 메뉴에는 생성기 내부 번호인
`template-01` 대신 사람이 의미를 이해할 수 있는 이름을 사용한다.
API도 intent와 family 조합을 검증하므로 메뉴 밖의 임의 문자열은 새 annotation으로
저장되지 않는다.

예:

- `We're low on milk` → `state_low_on_entity`
- `We're out of drinks` → `state_out_of_entity`
- `Add milk to the list` → `explicit_add_to_list`
- `Do we have milk?` → `yes_no_inventory_query`
- `Put that on the list` → `unresolved_reference`

맞는 family가 없다면 비슷한 family를 억지로 고르지 않는다. 선택을 비워 두고 notes에
새 family 후보를 기록한 뒤 shared contract와 convention을 함께 확장한다.

예:

```text
Text: We're almost out of drinks
Span: drinks
Label: CATEGORY
Normalized value: beverage
```

## Dataset export

production annotation을 내보내려면:

```bash
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl
```

export에는 entity spans, normalized slots, dataset purpose, phrase family가 포함된다.
두 split 사이에 같은 phrase family나 동일 문장이 있으면 export가 실패한다. 원문
데이터이므로 Git에 커밋하지 않는다.

## 배포 전 필수 작업

```bash
npm run db:migrate:remote
npm run deploy:api
```

그다음 기존 Vercel 프로젝트를 재배포한다. 마이그레이션 0004와 0005가 적용되지 않으면
annotation 저장과 통계 조회가 실패한다.

현재 production D1에는 migration 0005까지 적용됐고 Worker API도 배포됐다.
frontend는 GitHub `main`을 통해 기존 Vercel 프로젝트에 배포된다.

## 검증 기록

- TypeScript 테스트 11개 통과
- Python ML 테스트 3개 통과
- 전체 typecheck 통과
- Worker dry build 통과
- Next.js `/annotate` static production build 통과
- 실제 SQLite multi-action annotation 저장 통과
- action별 ITEM span 원문 검증 통과
- `intents`, `actions`, action별 normalized object가 포함된 JSONL export 통과
- desktop 및 390px mobile action-card UI 검증 통과
- production `/health`와 목적별 `/annotations/stats` 응답 확인

## 향후 개선 선택지

- 로그인 및 역할 기반 annotator 권한
- 더 강한 접근 제어와 audit history가 붙은 queue 관리 화면
- 두 명 이상의 독립 annotation과 합의(adjudication)
- annotation 수정·삭제 및 audit history
- keyboard shortcut과 token 단위 선택
- 중복 및 유사 문장 경고
- intent/entity별 세부 진행률 dashboard
- frozen evaluation set 승인 workflow

보호된 queue는 인증 없이 추가하지 않는다. 기존 대화 원문을 제3자에게 노출할 수
있기 때문이다.
