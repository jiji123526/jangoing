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

## 사용 순서

1. 실제로 말할 법한 영어 문장을 입력하고 `Create`를 누른다.
2. 규칙 기반 parser의 예측을 참고하되 올바른 intent를 직접 선택한다.
3. 원문에서 entity 단어를 드래그한다.
4. ITEM, CATEGORY, QUANTITY, UNIT, LOCATION, EXPIRY_DATE 중 label을 선택한다.
5. 필요한 경우 canonical/normalized 값을 입력한다.
6. Training candidate 또는 Evaluation candidate를 고른다.
7. 같은 표현군을 알고 있다면 phrase family를 입력한다.
8. 모호성이나 라벨 판단 근거가 있으면 notes에 기록한다.
9. `Save annotation`을 누른다.

## 저장 구조

마이그레이션 `0004_create_annotations.sql`이 `annotations` 테이블을 만든다.

저장 값:

- 연결된 inference ID
- 최종 intent
- entity label, 문자 start/end, 원문 text, normalized value
- normalized object
- train/evaluation 후보 구분
- phrase family
- notes와 annotator
- annotation schema version과 생성 시간

동일 inference는 한 번만 annotation할 수 있다. API는 entity span이 실제 원문과
일치하는지, span끼리 겹치지 않는지 다시 검증한다.

## 공개 production 화면 결정

사용자 요청에 따라 로그인 없이 production에 노출한다. 다음 위험이 있다.

- 제3자가 임의의 annotation을 저장할 수 있다.
- 악의적이거나 품질이 낮은 라벨이 데이터에 섞일 수 있다.
- API 호출량과 D1 쓰기량이 증가할 수 있다.

위험을 줄이기 위해 기존 production 대화 원문을 나열하는 공개 queue API는 만들지
않았다. 화면에서 새로 입력한 문장만 현재 브라우저에 표시하며, 공개 통계는 전체
저장 개수만 반환한다. 다른 사람이 입력한 원문을 `/annotate`에서 조회할 수 없다.

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
npm run dataset:export -- --remote --output ml/data/reviewed.jsonl
```

export에는 entity spans, normalized slots, dataset purpose, phrase family가 포함된다.
원문 데이터이므로 Git에 커밋하지 않는다.

## 배포 전 필수 작업

```bash
npm run db:migrate:remote
npm run deploy:api
```

그다음 기존 Vercel 프로젝트를 재배포한다. 마이그레이션 0004가 적용되지 않으면
annotation 저장과 통계 조회가 실패한다.

## 검증 기록

- TypeScript 테스트 8개 통과
- 전체 typecheck 통과
- Worker dry build 통과
- Next.js `/annotate` static production build 통과
- 실제 SQLite annotation 저장 통과
- ITEM span `[21,25]` 원문 검증 통과
- annotation 포함 JSONL export 통과

## 향후 개선 선택지

- 로그인 및 역할 기반 annotator 권한
- 기존 unlabeled 문장을 보여주는 보호된 queue
- 두 명 이상의 독립 annotation과 합의(adjudication)
- annotation 수정·삭제 및 audit history
- keyboard shortcut과 token 단위 선택
- 중복 및 유사 문장 경고
- intent/entity별 진행률 dashboard
- frozen evaluation set 승인 workflow

보호된 queue는 인증 없이 추가하지 않는다. 기존 대화 원문을 제3자에게 노출할 수
있기 때문이다.
