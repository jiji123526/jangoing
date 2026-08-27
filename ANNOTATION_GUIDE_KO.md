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

## Production-only 운영 규칙

production annotation page를 기준 DB 하나로 운영하려면 다음 규칙을 고정한다.

- annotation 작업은 Vercel `/annotate`에서만 한다.
- queue seed는 항상 `--remote`로 production D1에 넣는다.
- reviewed dataset export도 항상 `--remote`를 사용한다.
- `npm run dev:api`와 `apps/api/.local/jangoing.sqlite`는 production annotation
  운영 대상이 아니라 로컬 개발·디버깅용으로만 쓴다.

즉, production 화면에서 바로 보이길 원하는 데이터는 반드시 production D1에 들어가야
한다. 로컬 SQLite에만 넣은 queue sample은 Vercel 페이지에서 보이지 않는다.

### Production-only 명령 치트시트

```bash
cd /home/jjiwoo/.workspace/jangoing

# production annotation queue seed
npm run annotation:seed-queues -- --remote

# import pregenerated JSONL into generated_review
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1

# production annotation queue seed with a custom mix
npm run annotation:seed-queues -- --remote \
  --correction 50 \
  --expiry 120 \
  --low-confidence 70 \
  --confirmed 40 \
  --evaluation 20

# reviewed production dataset export
npm run dataset:export -- --remote \
  --train-output ml/data/reviewed-train.jsonl \
  --evaluation-output ml/data/reviewed-evaluation.jsonl

# optional: enable OpenAI-backed assistant drafts on production Worker
cd apps/api
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
cd ../..

# apply new D1 schema changes before deploy when needed
npm run db:migrate:remote

# API deploy after backend changes
npm run deploy:api

# Web deploy after frontend changes
git push origin main
```

annotation 화면 주소:

```text
https://jangoing-web.vercel.app/annotate
```

## 사용 순서

1. 실제로 말할 법한 영어 문장을 직접 입력하거나 queue 버튼으로 기존 inference
   샘플 하나를 불러온다. 페이지에 처음 들어오면 가능할 때 `generated_review`
   샘플을 기본으로 한 번 자동 로드한다. 직접 입력 후에는 `Enter` 또는 `Create`를 누른다.
   줄바꿈이 필요하면 `Shift + Enter`를 사용한다.
2. 규칙 기반 parser의 예측을 참고해 첫 action의 intent를 선택한다.
3. 문장에 별도 요청이 더 있으면 `Add action`으로 action을 추가하고 intent를 고른다.
4. 라벨링할 action을 활성화한 뒤 원문에서 entity 단어를 드래그한다.
5. ITEM, CATEGORY, QUANTITY, UNIT, LOCATION, EXPIRY_DATE 중 label을 선택한다.
6. label별 dropdown에서 canonical/normalized 값을 선택한다. EXPIRY_DATE는 날짜
   선택기를 사용한다.
7. 필요하면 `Draft with AI`를 눌러 action/entity 초안을 받아온다. 초안은 정답이
   아니라 시작점이며, `Apply AI draft` 후에도 반드시 사람이 수정 여부를 확인한다.
8. 각 action에서 intent별 phrase family를 선택한다.
9. Training candidate 또는 Evaluation candidate를 고른다.
10. 모호성이나 라벨 판단 근거가 있으면 notes에 기록한다.
11. `Save annotation`을 누른다.

### Assistant draft 동작

- `Draft with AI`
  현재 샘플의 raw utterance와 parser prediction을 바탕으로 annotation action 초안을
  요청한다.
- `Apply AI draft`
  제안된 action, entity span, normalized value를 현재 편집 상태에 복사한다.
- 사람이 손으로 수정한 뒤 저장하면, 시스템은 그 annotation이 AI draft를 그대로
  채택했는지(`accepted_as_is`) 아니면 수정 후 저장했는지(`accepted_with_edits`)
  함께 기록한다.
- Worker에 `OPENAI_API_KEY`가 없으면 이 기능은 실패하지 않고 parser fallback
  draft를 반환한다. 이 경우 보통 intent 1개와 빈 entity로 시작한다.
- AI/provider 응답은 보조 정보일 뿐이며, ground truth는 저장된 human annotation이다.

### Assistant draft API 흐름

이 기능은 브라우저가 OpenAI를 직접 호출하는 구조가 아니다. 실제 흐름은 다음과 같다.

1. annotator가 `/annotate`에서 `Draft with AI`를 누른다.
2. web app이 현재 `inference_id`를 담아 `POST /annotations/proposal`을 Worker로 보낸다.
3. Worker는 `inference_logs`에서 해당 발화의 `raw_utterance`와 현재 parser의
   `predicted_interpretation`을 읽는다.
4. Worker에 `OPENAI_API_KEY`가 있으면 OpenAI Chat Completions API
   `POST https://api.openai.com/v1/chat/completions`를 호출한다.
5. 요청에는 다음 정보가 들어간다.
   - system prompt:
     grocery annotation draft를 만들고 JSON만 반환하라는 규칙
   - user prompt:
     `raw_utterance`, `parser_prediction`, `allowed_intents`
   - model:
     `OPENAI_MODEL`이 있으면 그 값, 없으면 기본값 `gpt-4.1-mini`
   - decoding:
     `temperature: 0.2`, `response_format: json_object`
6. OpenAI가 action/entity draft JSON을 반환하면 Worker가 Zod schema로 구조를 검증한다.
7. entity는 model이 문자 offset을 직접 주는 방식이 아니라, model이 돌려준 `text`를
   원문에서 다시 찾아 `start/end` span으로 복원한다.
8. 복원 과정에서 원문과 일치하지 않는 entity text는 버린다. intent에 맞지 않는
   phrase family도 저장하지 않고 `null`로 떨어뜨린다.
9. 정리된 proposal은 `annotation_proposals` 테이블에 저장된다.
   저장 항목:
   `provider`, `model`, `prompt_version`, `proposal`, `note`, `status`,
   `created_at`
10. Worker는 정리된 proposal을 브라우저에 돌려준다.
11. annotator가 `Apply AI draft`를 누르면 그 proposal이 현재 편집 상태에 복사된다.
12. 최종 저장 시 web app은 필요하면 `assistant_proposal_id`와
   `assistant_resolution`을 함께 `POST /annotations`로 보낸다.
13. Worker는 annotation 저장 후 해당 proposal row를 `applied` 상태로 바꾸고,
   `accepted_as_is` 또는 `accepted_with_edits`를 기록한다.

### Fallback과 한계

- `OPENAI_API_KEY`가 없으면 Worker는 외부 AI API를 호출하지 않고
  `provider = parser-fallback`, `model = rules-v1`로 proposal을 만든다.
- 이 fallback draft는 현재 parser intent를 그대로 시작점으로 쓰고 entity는 비워 둔다.
- 즉, annotation 화면은 항상 동작하지만 초안 품질은 OpenAI 사용 여부에 따라 크게
  달라질 수 있다.
- 현재 span 복원은 exact substring match 기반이므로, model이 원문에 없는 축약형이나
  paraphrase를 반환하면 그 entity는 자동으로 사라진다.
- 이 구조는 의도적으로 보수적이다. 잘못된 span을 억지로 저장하는 것보다, 비워 둔 뒤
  사람이 다시 잡는 편이 dataset 품질에 더 안전하다.

## Queue 버튼

`/annotate`는 새 문장을 직접 만드는 것 외에 우선순위 queue에서 샘플을 하나씩
불러올 수 있다.

- `Load correction queue`: 사용자가 이미 correction을 남긴 문장
- `Load expiry queue`: 날짜/유통기한 표현이 들어간 문장
- `Load low-confidence queue`: confidence가 낮거나 `unknown`,
  `needs_clarification`에 가까운 문장
- `Load generated review`: pregenerated dataset에서 가져온 broad-coverage 문장
- `Load confirmed queue`: 실사용에서 맞았고 confirmed된 문장
- `Load evaluation holdout`: evaluation 후보로 분리하려는 reviewed 문장

페이지 첫 진입 시에는 annotator가 바로 시작할 수 있도록 `generated_review` queue를
한 번 자동으로 불러온다. 이후에는 각 버튼으로 원하는 queue를 수동 전환하면 된다.

queue에서 불러온 샘플은 해당 raw text와 예측값을 기반으로 편집한다. correction이
이미 저장된 샘플이면 reviewed intent가 기본 intent 선택에 반영된다. evaluation
holdout 샘플은 dataset purpose도 기본적으로 `Evaluation candidate`로 선택된다.

로컬 annotation queue를 빠르게 채우고 싶다면 아래 명령으로 deterministic synthetic
reviewed sample을 넣을 수 있다.

```bash
npm run annotation:seed-queues
```

기본 seed 수량은 다음과 같다.

- `correction`: 36
- `expiry`: 48
- `low_confidence`: 36
- `confirmed_unannotated`: 42
- `evaluation_holdout`: 24

이 스크립트는 `apps/api/.local/jangoing.sqlite`가 없으면 자동으로 만들고 migration
0006까지 적용한다. 이미 같은 seed ID가 있으면 같은 row를 갱신하므로 반복 실행해도
안전하다. production D1에 넣고 싶다면 root에서 다음처럼 실행한다.

```bash
npm run annotation:seed-queues -- --remote
```

주의: 여기서 넣는 숫자는 **queue에서 최종적으로 보이는 개수**가 아니라 seed로 넣는
reviewed inference record 개수다. queue 조건이 겹치기 때문에 하나의 record가 여러
queue에 동시에 잡힐 수 있다.

pregenerated JSONL dataset을 review source로 쓰고 싶다면 `generated_review` 전용
queue에 import한다. 이 방식은 synthetic/pregenerated 문장을 `correction`이나
`confirmed`에 섞지 않고 별도 source로 관리할 수 있다.

```bash
npm run annotation:import-generated -- --remote \
  --input ml/datasets/synthetic-v1.jsonl \
  --label synthetic-v1
```

### D1에서 queue data 확인하는 방법

queue는 D1 안에 `correction_queue` 같은 별도 테이블로 저장되지 않는다. queue는
`inference_logs`를 조건으로 조회해서 만들며, seed script도 queue sample을
`inference_logs`에 넣는다.

따라서 D1 UI 왼쪽 패널에서 `annotations`, `corrections`, `events`, `inference_logs`
같은 **테이블 이름만 보이는 것은 정상**이다. 그 화면은 schema 브라우저이며, queue row는
SQL로 확인해야 한다.

production D1 SQL editor에서 먼저 seed row가 들어갔는지 확인:

```sql
SELECT COUNT(*) AS seeded_rows
FROM inference_logs
WHERE source = 'annotation-queue-seed-v1';
```

최근 seed row 보기:

```sql
SELECT id, raw_utterance, source, outcome, created_at
FROM inference_logs
WHERE source = 'annotation-queue-seed-v1'
ORDER BY created_at DESC
LIMIT 20;
```

correction queue 후보 수 확인:

```sql
SELECT COUNT(*) AS correction_candidates
FROM inference_logs il
LEFT JOIN annotations a ON a.inference_id = il.id
WHERE a.id IS NULL
  AND il.outcome = 'corrected'
  AND il.corrected_interpretation IS NOT NULL;
```

### Queue별 데이터 의미와 목적

#### `correction queue`

- 들어오는 데이터:
  `inference_logs` 중 `outcome = corrected`이고 아직 annotation이 없는 문장
- 현재 샘플 성격:
  모델이 실제로 틀렸고, 사용자가 이미 더 나은 해석을 남긴 실사용 오류 사례
- 주 목적:
  intent 오류와 slot 오류를 빠르게 회수해 supervised dataset의 에러 밀도를 높이는 것
- 주의:
  이 큐만 계속 쓰면 dataset이 “모델이 틀린 문장” 쪽으로 과하게 치우친다.

#### `expiry queue`

- 들어오는 데이터:
  raw utterance에 `expire`, `best by`, `tomorrow`, `next friday`, 월 이름 같은
  expiry/date signal이 들어가고 아직 annotation이 없는 문장
- 현재 샘플 성격:
  날짜 span, expiry 표현, 자연어 날짜 normalization이 중요한 문장
- 주 목적:
  `EXPIRY_DATE` entity와 date normalization 품질을 끌어올릴 slot-training 후보를
  집중 수집하는 것
- 주의:
  expiry signal이 들어간다고 모두 같은 action은 아니다. 새 item을 넣는 문장은
  `add_item`, 기존 item의 expiry metadata를 추가·수정하는 문장은 `update_expiry`,
  만료 때문에 버리는 문장은 `throw_away`가 될 수 있으므로 실제 intent와 entity span은
  사람이 다시 확정해야 한다.
  expiry queue 샘플에는 parser가 계산한 ISO expiry date가 있으면
  `Apply parsed expiry date` helper 버튼이 나타난다. 먼저 사람이 정확한
  `EXPIRY_DATE` span을 만든 뒤, 그 값이 맞아 보일 때만 적용한다.

#### `low-confidence queue`

- 들어오는 데이터:
  parser confidence가 낮거나 predicted intent가 `unknown`,
  `needs_clarification`인 문장 중 아직 annotation이 없는 것
- 현재 샘플 성격:
  모델이 가장 헷갈려하는 문장, 경계 사례, ambiguity 사례
- 주 목적:
  적은 수의 annotation으로도 intent classifier와 fallback policy를 가장 효율적으로
  개선하는 active-learning 성격의 dataset 후보를 모으는 것
- 주의:
  이 큐는 어려운 문장 비중이 높아서 실제 사용 분포를 대표하지는 않는다.

#### `generated review`

- 들어오는 데이터:
  pregenerated JSONL dataset을 `annotation:import-generated`로 import한 문장 중 아직
  annotation이 없는 것
- 현재 샘플 성격:
  broad coverage를 빠르게 확보하기 위한 synthetic/pregenerated review 후보
- 주 목적:
  직접 문장을 떠올리기 어려울 때 annotation source를 제공하고, intent coverage와
  surface variety를 빠르게 넓히는 것
- 주의:
  이 큐는 actual user traffic이 아니다. parser가 현재 문장을 어떻게 해석하는지와,
  pregenerated reference intent가 함께 들어가지만, 그 reference를 절대 정답처럼
  맹신하지 않는다. bootstrapping 용도로 보고, 장기적으로는 real reviewed data의
  비중이 더 커져야 한다.

#### `confirmed queue`

- 들어오는 데이터:
  `outcome = confirmed`이고 reviewed interpretation이 있으며 아직 annotation이 없는 문장
- 현재 샘플 성격:
  모델 예측이 맞았고 사용자도 그대로 확인한 정상 실사용 문장
- 주 목적:
  correction/low-confidence 위주 수집으로 생기는 편향을 줄이고, 실제 production
  분포에 가까운 학습 데이터를 보강하는 것
- 주의:
  “쉬운 문장”이 많이 들어올 수 있으므로, 이 큐만 쓰면 challenge set이 약해진다.

#### `evaluation holdout`

- 들어오는 데이터:
  reviewed(`confirmed` 또는 `corrected`) 되었고 아직 annotation이 없으며,
  deterministic bucket 규칙에 걸린 문장
- 현재 샘플 성격:
  학습용과 분리하려고 미리 떼어 놓는 검증/평가 후보
- 주 목적:
  나중에 validation 또는 frozen test로 승인할 수 있는 independent evaluation
  candidate를 production flow에서 일찍부터 따로 쌓는 것
- 주의:
  이 큐에서 불러오면 dataset purpose가 기본적으로 `Evaluation candidate`가 된다.
  다만 이것이 자동으로 최종 test set을 뜻하는 것은 아니다.

### Queue와 dataset의 관계

- `correction`, `expiry`, `low-confidence`, `confirmed`는 주로 **training candidate
  source**로 생각하면 된다.
- `generated_review`는 **bootstrapping용 training candidate source**다.
- `evaluation holdout`은 기본적으로 **evaluation candidate source**다.
- 실제 저장되는 split은 queue 이름이 아니라, annotator가 최종 저장할 때의
  `dataset purpose`와 이후 export 검증으로 결정된다.
- 따라서 같은 queue에서 불러온 샘플이라도 품질 검토 후 다른 purpose로 저장할 수는
  있지만, 특별한 이유가 없다면 queue의 기본 목적을 따르는 편이 일관성이 높다.

### seed/synthetic queue data의 한계

queue seed와 synthetic data는 annotation을 시작하고 UI workflow를 검증하는 데는
유용하지만, 표면 문장 패턴이 너무 통일될 수 있다는 한계가 있다. 문제는 schema 자체가
아니라 **같은 template 가족이 너무 많이 반복되면 모델이 구조 대신 문장 껍데기를 외울 수
있다**는 점이다.

운영 원칙:

- seed/synthetic data는 annotation bootstrapping과 smoke test 용도로 본다.
- 실제 학습 데이터의 중심은 점점 reviewed real utterance로 옮긴다.
- `confirmed` queue와 실제 correction traffic을 계속 섞어 real distribution을 복원한다.
- 최종 평가는 synthetic가 아니라 reviewed evaluation holdout과 frozen set으로 한다.

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
`0006_create_annotation_proposals.sql`은 AI draft proposal 기록 테이블을 추가한다.

저장 값:

- 연결된 inference ID
- action별 최종 intent와 phrase family
- action별 entity label, 문자 start/end, 원문 text, normalized value
- action별 normalized object
- train/evaluation 후보 구분
- phrase family
- notes와 annotator
- annotation schema version(`annotation-v2`)과 생성 시간
- 필요하면 연결된 assistant proposal ID와 acceptance 결과

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

## Normalized value 입력 방식

annotation-v2는 label별로 다른 입력 방식을 사용한다.

- ITEM, CATEGORY, UNIT: 기존 canonical 값 추천 + 새 값 직접 입력
- QUANTITY: 숫자 입력 + 기존 숫자 추천
- LOCATION: API contract가 지원하는 `fridge`, `freezer`, `pantry`
- EXPIRY_DATE: ISO 날짜를 만드는 날짜 선택기

ITEM, CATEGORY, UNIT은 추천 목록에 값이 없더라도 annotator가 새 canonical 값을 바로
입력할 수 있다. 가능하면 영문 소문자 `snake_case`를 사용한다. 저장이 끝나면 그 값은
이후 annotation에서 자동으로 재사용 후보에 포함된다.

의미가 불확실한데 단순히 목록에 없다는 이유로 새 값을 만들지는 않는다. 이 경우에는
틀린 normalized value를 넣기보다 span 또는 intent를 다시 보고, 판단 근거를 notes에
남긴다.

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
