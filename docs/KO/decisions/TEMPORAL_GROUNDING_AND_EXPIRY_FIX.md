# Temporal Grounding and Expiry Annotation Fix

## 구현 상태

### 완료: 공통 temporal grounding

이제 Worker API와 local API는 interpretation request가 들어오면 다음 기준으로
effective temporal context를 결정한다.

```text
explicit reference_date
or local calendar date at request time
+
validated timezone
or UTC fallback
```

두 값 모두 client가 생략했더라도 `inference_logs.request_context`에 저장된다.
parser와 향후 annotation path는 relative expiry normalization을 위해
`apps/api/src/nlp/temporal-grounding.ts`를 공유한다. 이로써 parsing이
재현 가능해지고, parser가 자체 현재 시계를 독립적으로 참조하는 일을 막을 수
있다.

regression test는 stored reference date, later processing, timezone boundary,
invalid timezone fallback, invalid date text를 다룬다.

### 완료: temporal context를 반영한 assistant draft

assistant proposal lookup은 이제 `request_context`와 original inference
`created_at`을 함께 로드한다. 그 결과 계산된 effective `reference_date`와
`timezone`이 assistant prompt에 포함된다.

assistant의 역할은 정확한 `EXPIRY_DATE` text span을 찾는 것뿐이다. proposal을
materialize할 때 API는 model이 제공한 expiry normalized value를 무시하고,
shared deterministic normalizer로 ISO date를 계산한다.

```text
exact raw span + original temporal context -> YYYY-MM-DD
```

date span을 normalize할 수 없으면 그 entity만 drop된다. action과 다른 valid
entity는 human review를 위해 그대로 남는다. 따라서 malformed model date output이
이제 proposal 전체를 HTTP 500으로 바꾸지 않는다.

prompt contract version은 `annotation-ai-v6`이다.

### 완료: queue와 annotation의 temporal context

이제 모든 annotation queue item은 다음 값을 반환한다.

```text
temporal_context.reference_date
temporal_context.timezone
temporal_context.inference_created_at
temporal_context.normalized_expiry_suggestion (when parseable)
```

queue SQL은 나중 `resolved_at`으로 대체하지 않고, original inference
timestamp인 `il.created_at`을 그대로 보존한다. queue builder는 supported
expiry span을 추출한 뒤, 저장된 temporal context를 사용해 서버에서 normalize한다.

expiry annotation screen은 네 값을 모두 표시한다. apply action은 먼저
server-derived suggestion을 사용하고, 그다음 reviewed 또는 predicted ISO value를
fallback으로 사용한다. browser는 original timestamp를 화면 표시용으로만
format하며, 현재 브라우저 시계를 사용해 date semantics를 다시 계산하지 않는다.

### 완료: explicit expiry seed v2

queue seed source는 이제 `annotation-queue-seed-v2`이며, v1 record를 덮어쓸 수
없는 별도 UUID namespace를 사용한다. 모든 expiry phrase는 자신만의
`reference_date`, `timezone`, expected ISO date를 가진다. shared normalizer가
그 기대값과 다르면 seed generation은 실패한다.

synthetic `created_at` timestamp는 각 example의 reference date에 맞춰 정렬된다.
v2를 다시 실행해도 `ON CONFLICT DO NOTHING`을 사용하며, seed semantics를 바꾸려면
기존 reviewed provenance를 수정하는 대신 새 versioned namespace를 만들어야 한다.

test는 모든 explicit date case와 generated expiry phrase 전체를 검증하며,
evaluation holdout record 안의 expiry example도 포함한다.

### 남은 작업

- end-to-end test framework를 도입하면 browser-level UI regression coverage를
  추가한다.

## 배경

프로젝트는 현재 inference creation timestamp와 annotation creation timestamp를
저장하고 있으며, expiry normalization에는 별도의 `reference_date`도 사용한다.

이 구분은 시스템이 장기적으로 다음과 같은 temporal question에 답해야 하기 때문에
중요하다.

```text
How long has it been since I added the eggs?
When did I put this milk in?
What expires tomorrow?
How many days have these strawberries been in the fridge?
```

이 질문들에 안정적으로 답하려면, 모든 relative-date interpretation과
annotation은 나중 annotation 시점이나 임의의 seed-generation date가 아니라
**original user utterance의 시점**에 grounding되어야 한다.

---

## 현재 동작

### 실사용자 입력

일반적인 user input에서는 browser가 현재 다음 값을 보낸다.

```json
{
  "text": "The milk expires tomorrow",
  "reference_date": "2026-08-27",
  "timezone": "America/Los_Angeles"
}
```

API는 이 context를 `inference_logs.request_context`에 저장한다.

inference record에는 다음 값도 있다.

```text
inference_logs.created_at
```

즉 real user traffic에는 이미 두 가지 서로 다른 temporal concept가 존재한다.

```text
reference_date
= relative language를 해석할 때 사용하는 사용자의 local calendar date

created_at
= inference가 실제로 생성된 timestamp
```

이 구분 자체는 바람직하다.

---

## 현재 문제

deterministic expiry queue seed generator는 현재 다음 fixed value를 사용한다.

```ts
const baseReferenceDate = "2026-09-01";
const baseTimezone = "America/Los_Angeles";
```

그 결과 다음 seeded sentence는:

```text
The milk expires tomorrow.
```

실제로는 다음 값을 가질 수 있다.

```text
reference_date = 2026-09-01
expiration_date = 2026-09-02
```

annotator가 8월 27일에 이 문장을 검토하더라도 그렇다.

이것은 real user utterance에서 상대 날짜를 사용자의 실제 local date 기준으로
해석하는 annotation practice와 어긋난다.

문제는 annotation이 annotation timestamp를 써야 한다는 뜻이 아니다.

문제는 **synthetic/seeded example이 annotator에게 명확히 보이지 않는 인공적인
날짜에 grounding되어 있고, 그 날짜가 dataset의 의도한 temporal semantics와
충돌할 수 있다는 점**이다.

---

## 중요한 원칙

relative temporal expression은 **원래 utterance의 temporal context**를 사용해
해석해야 한다.

예를 들어:

```text
User says on 2026-08-27:
"The eggs expire tomorrow."
```

canonical expiry date는 annotation이 다음 날에 이루어지더라도:

```text
2026-08-28
```

로 유지되어야 한다.

```text
2026-08-30
```

annotation date가 original utterance의 의미를 바꾸면 안 된다.

따라서:

```text
expiry normalization source of truth
= original utterance reference_date + timezone

NOT annotation.created_at
NOT assistant proposal.created_at
NOT current browser date during later review
```

---

## 이것이 expiry annotation을 넘어 중요한 이유

temporal grounding은 expiry 기능만의 문제가 아니다.

장기적으로 제품은 inventory history에 대해 reasoning할 수 있어야 한다.

예를 들어:

```text
User:
"I bought eggs today."
```

그 후:

```text
User:
"How long has it been since I added the eggs?"
```

시스템은 original inventory event의 timestamp로부터 답을 계산할 수 있어야 한다.

개념적으로:

```text
egg added_at = 2026-08-27T18:42:00-07:00

query time = 2026-08-30T10:00:00-07:00

elapsed time
= approximately 2 days 15 hours
```

이를 위해 다음 timestamp를 안정적으로 구분해야 한다.

1. **utterance/event time**
2. **relative-language reference date**
3. **annotation time**
4. **model/assistant processing time**

이 timestamp들은 절대 서로 바꿔 써서는 안 된다.

---

## 권장 temporal data model

프로젝트는 다음 temporal information을 보존해야 한다.

### Inference

```text
inference_logs
├── created_at
├── request_context
│   ├── reference_date
│   └── timezone
├── raw_utterance
└── predicted_interpretation
```

의미:

```text
created_at
= user interaction이 실제로 시스템에 도달한 시각

reference_date
= "today", "tomorrow", "next Friday" 같은 표현을 해석할 때 사용하는
  local calendar date

timezone
= original interaction 당시의 user timezone
```

---

### Annotation

```text
annotations
└── created_at
```

의미:

```text
human review가 일어난 시각
```

이 timestamp는 annotation auditing에는 유용하지만, original utterance의 relative
language를 다시 해석하는 데 **사용하면 안 된다**.

---

### Inventory/Event record

향후 temporal question을 위해 event record는 다음을 보존해야 한다.

```text
events
├── created_at
├── event_type
├── item_name
├── expiration_date
└── source inference / provenance
```

`created_at`은 inventory-changing event가 기록된 시각을 나타내야 한다.

이후 제품이 과거 사건에 대한 발화를 지원하게 되면 다음 구분도 유용해질 수 있다.

```text
recorded_at
event_time
```

예를 들어:

```text
"I bought the eggs yesterday."
```

문장은 today 기록되지만, semantic event는 yesterday 발생했다.

temporal language coverage가 확장될 때 이 구분을 나중에 추가할 수 있다.

---

## Required Fix 1: Expiry seed에서 숨겨진 fixed-date semantics 제거

**상태: `annotation-queue-seed-v2`에서 구현 완료.**

현재 다음 값은:

```ts
const baseReferenceDate = "2026-09-01";
```

이 정보가 드러나지 않은 채 모든 relative expiry seed의 의미를 silently
정의해서는 안 된다.

허용 가능한 접근은 두 가지다.

### 선호 접근

각 seeded sample에 explicit reference date를 넣고, 그 date를 annotation
workflow에 노출한다.

예:

```json
{
  "raw_utterance": "The milk expires tomorrow.",
  "request_context": {
    "reference_date": "2026-08-27",
    "timezone": "America/Los_Angeles"
  }
}
```

expected normalization:

```text
tomorrow -> 2026-08-28
```

annotator는 example을 검토할 때 다음을 볼 수 있어야 한다.

```text
Reference date: 2026-08-27
Timezone: America/Los_Angeles
```

### 대안

재현성을 위해 deterministic fixed-date seed generation을 유지하더라도, UI는
seed의 reference date를 명확히 보여 주어야 한다.

그 date는 annotator에게 절대로 숨겨지면 안 된다.

---

## Required Fix 2: Assistant draft에 temporal context 전달

**상태: `annotation-ai-v6`에서 구현 완료.**

현재 assistant proposal lookup은 다음을 읽는다.

```sql
SELECT raw_utterance, predicted_interpretation
FROM inference_logs
WHERE id = ?
```

이 query에는 다음이 빠져 있다.

```text
request_context.reference_date
request_context.timezone
```

그 결과 assistant는:

```text
"The milk expires tomorrow."
```

라는 문장을 `tomorrow`가 무엇을 의미하는지 모른 채 받게 된다.

proposal flow는 대신 다음을 로드해야 한다.

```text
raw_utterance
predicted_interpretation
request_context
created_at
```

그리고 relevant temporal context를 assistant proposal pipeline에 전달해야 한다.

개념적으로:

```json
{
  "raw_utterance": "The milk expires tomorrow.",
  "reference_date": "2026-08-27",
  "timezone": "America/Los_Angeles",
  "parser_prediction": {}
}
```

---

## Required Fix 3: LLM이 calendar date를 계산하게 두지 않기

**상태: `annotation-ai-v6`에서 구현 완료.**

프로젝트의 기존 원칙은 유지되어야 한다.

> LLM은 raw temporal span을 식별하고, deterministic code가 calendar date를
> 해석한다.

예시 LLM output:

```json
{
  "label": "EXPIRY_DATE",
  "text": "next Friday",
  "start": 21,
  "end": 32
}
```

그다음 server가 기존 date normalizer를 사용해 다음을 계산한다.

```text
next Friday
+ reference_date
+ timezone
-> 2026-09-04
```

LLM이 다음 값을 만들어 냈다고 해서 그대로 신뢰하면 안 된다.

```json
{
  "normalized_value": "2026-09-04"
}
```

deterministic verification 없이 그대로 받으면 안 된다.

이 방식은 model이 다음처럼 반환해서 ISO-date annotation schema를 깨는 현재 failure
mode도 막는다.

```text
normalized_value = "tomorrow"
```

---

## Required Fix 4: Expiry suggestion은 저장된 temporal context를 사용해야 함

**상태: annotation queue response와 `/annotate`에서 구현 완료.**

annotation UI는 현재 reviewed 또는 predicted interpretation에 저장된
`expiration_date`를 재사용한다.

그 값이 inference 시점에 올바르게 계산되었다면 이는 허용 가능하다.

하지만 normalized expiry date가 없거나 다시 계산해야 한다면, 시스템은
annotation 시점의:

```text
new Date()
```

가 아니라, 저장된 다음 값을 사용해야 한다.

```text
stored request_context.reference_date
+
stored request_context.timezone
```

그래야 reproducibility가 보장된다.

---

## Required Fix 5: Annotation 중 temporal context 표시

**상태: expiry queue sample에서 구현 완료.**

relative temporal language가 포함된 utterance라면 annotation UI는 다음과 같은
정보를 보여야 한다.

```text
Temporal context
Reference date: 2026-08-27
Timezone: America/Los_Angeles
Original inference: 2026-08-27 18:42 PDT
```

특히 다음 표현에서 중요하다.

```text
today
tomorrow
yesterday
next Friday
this weekend
in three days
a week from now
```

original reference date 없이는 human annotator가 올바른 normalized date를
안정적으로 결정할 수 없다.

---

## Required Fix 6: Regression test 추가

**상태: temporal normalization, assistant materialization, queue response, seed
generation에 대해 구현 완료. Browser rendering은 현재 end-to-end UI suite가
아니라 typechecking 수준으로만 커버된다.**

최소한 다음 case를 다루는 test를 추가해야 한다.

### Relative date는 저장된 reference date를 사용

```text
reference_date = 2026-08-27
utterance = "The milk expires tomorrow."

expected:
expiration_date = 2026-08-28
```

### Annotation이 나중에 발생

```text
utterance date = 2026-08-27
annotation date = 2026-08-30

expected:
"tomorrow" still resolves to 2026-08-28
```

### Assistant가 temporal context를 받음

assistant draft construction이 stored inference context로부터 다음 값을 받는지
검증한다.

```text
reference_date
timezone
```

### Invalid LLM date가 HTTP 500을 만들지 않음

model이 다음을 반환하더라도:

```json
{
  "label": "EXPIRY_DATE",
  "text": "tomorrow",
  "normalized_value": "tomorrow"
}
```

proposal flow가 crash해서는 안 된다.

raw span은 다음 중 하나로 처리되어야 한다.

1. deterministic하게 normalize한다; 또는
2. invalid normalized value를 받아들이지 않고 human review용으로 유지한다.

### Timezone boundary

사용자의 local date가 UTC와 다른 case를 최소 하나는 test해야 한다.

예:

```text
America/Los_Angeles local date: 2026-08-27
UTC date: 2026-08-28
```

expected relative-date interpretation은 사용자의 local reference date를 따라야
한다.

---

## 향후 temporal query architecture

장기 시스템은 다음 같은 질문을 지원해야 한다.

```text
"How long has it been since I added the eggs?"
```

이 query는 annotation data에 의존하면 안 된다.

답은 event timeline에서 계산해야 한다.

개념적으로:

```text
User query
    |
    v
query_inventory / temporal query
    |
    v
resolve ITEM = egg
    |
    v
find most relevant egg event
    |
    v
event.created_at / event_time
    |
    v
calculate elapsed duration using current user timezone
```

예:

```text
egg event:
2026-08-25T19:30:00-07:00

query:
2026-08-27T21:30:00-07:00

answer:
"You added the eggs about 2 days ago."
```

따라서 temporal metadata는 annotation 편의 기능이 아니라 first-class product
data로 다뤄져야 한다.

---

## 향후 확장: Recorded time과 semantic event time

결국 일부 utterance는 말하는 순간에 일어난 일이 아닌 과거 사건을 가리키게 된다.

예:

```text
"I bought eggs yesterday."
```

시스템은 이 문장을 8월 27일에 받는다.

그러면:

```text
recorded_at = 2026-08-27
event_time = 2026-08-26
```

다음 질문에서는:

```text
"How long have the eggs been here?"
```

`recorded_at`보다 `event_time`이 더 의미 있다.

이 구분은 immediate fix에 필수는 아니지만, data model이 나중 확장을 어렵게
만드는 가정을 품지 않도록 해야 한다.

---

## 결정

프로젝트는 **original-user-time temporal grounding**을 canonical rule로 사용한다.

### Source of truth

language interpretation의 기준:

```text
request_context.reference_date
+
request_context.timezone
```

실제 inventory-history question의 기준:

```text
event timestamp / semantic event time
```

### semantic reference로 절대 사용하지 않을 것

```text
annotation.created_at
assistant_proposal.created_at
current annotation-session date
arbitrary hidden seed date
```

이 값이 original event 자체를 명시적으로 나타내는 경우가 아니라면 사용하면 안
된다.

---

## 구현 우선순위

1. 완료: original inference temporal context를 로드하고 보존한다.
2. 완료: 그 context를 사용해 parser, assistant, queue expiry value를
   deterministic하게 normalize한다.
3. 완료: expiry annotation에서 temporal context를 노출한다.
4. 완료: 숨겨진 expiry seed date를 explicit v2 case로 교체한다.
5. 다음: elapsed-time question을 위해 event timestamp를 보존하고 query한다.
6. 이후: retrospective statement를 위해 semantic `event_time`을 도입한다.

---

## 요약

이 변경의 목적은 단순히 잘못된 expiry suggestion을 고치는 것이 아니다.

이것은 시스템이 inventory history를 reasoning하기 위해 필요한 temporal foundation을
세우는 작업이다.

핵심 규칙은 다음과 같다.

> relative language는 사용자의 original temporal context로 해석하고,
> 이후 temporal question은 실제 event timeline으로 답한다.

이렇게 해야 오늘의 expiry annotation과, 미래의 다음 질문이:

```text
"How long has it been since I added the eggs?"
```

하나의 일관된 temporal model을 공유할 수 있다.
