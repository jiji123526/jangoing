# Conversation Data Collection Decision

## 배경

프로젝트는 원래 사용자 발화 앞에 trigger word(wake word)를 붙여서,
assistant를 향해 명시적으로 전달된 언어만 시스템이 처리하게 하는 방식을
검토했다.

trigger 기반 상호작용은 다음과 같다.

```text
Hey Jango, we're almost out of milk.
```

이 접근은 activation을 단순화하고 accidental input을 줄여 준다는 점에서
제품 관점에서는 매력적이다. 하지만 이 프로젝트는 명시적 command syntax만
다루는 것이 아니라, 자연스러운 일상 대화 속에서 actionable request, relevant
state, contextual information을 어떻게 복원하는지를 연구하는 것이 목적이다.

그 목표 때문에 mandatory trigger word가 language-learning problem에 미치는
영향을 다시 검토하게 되었다.

---

## 질문 1: Trigger word가 unrelated-statement annotation의 가치를 줄이는가?

NLU 시스템에 도달하는 모든 발화가 이미 trigger word로 시작한다면, 완전히
관련 없는 말은 runtime distribution에서 훨씬 덜 나타난다.

예를 들어:

```text
I'm tired today.
```

이런 문장은 assistant가 explicit wake word 이후에만 듣는 구조라면 보통
downstream parser까지 내려오지 않는다.

따라서 strict trigger-based architecture에서는 대량의
`unrelated_statement` 데이터를 수집하는 우선순위가 상대적으로 낮아진다.

그래도 다음과 같은 경우를 위해 일부 negative example은 여전히 유용하다.

- false wake-word activation;
- 사용자가 assistant를 불러놓고 관련 없는 말을 하는 경우;
- 중간에 버려진 request나 malformed request;
- grocery vocabulary는 포함하지만 action을 의미하지는 않는
  domain-adjacent speech.

가장 유용한 negative example은 완전히 unrelated한 문장보다,
다음과 같은 **domain-adjacent non-actionable language**다.

```text
I really like oat milk.
Milk has gotten so expensive.
We had pasta yesterday.
Spinach is healthier than lettuce.
Maybe I'll cook chicken later.
```

이 예시들은 grocery-related word가 들어가면 자동으로 inventory action이라고
판단하는 lexical shortcut을 모델이 학습하지 못하게 막아 준다.

---

## 질문 2: Trigger word를 요구하면 프로젝트의 conversational focus가 약해지는가?

그럴 가능성이 있다.

trigger word가 없으면 시스템은 다음 같은 발화를 해석해야 할 수 있다.

```text
We're making pasta tonight, but I think the spinach is old.
```

모델은 이 발화에 relevant state가 있는지, implied action이 있는지, 혹은
contextual information인지 판단해야 한다.

반대로 입력이 다음과 같다면:

```text
Hey Jango, we're making pasta tonight, but I think the spinach is old.
```

시스템은 이미 중요한 정보를 하나 받은 상태다. 이 발화가 assistant를 향해
명시적으로 전달되었다는 점이다.

이렇게 되면 relevance-detection problem이 더 쉬워지고, 프로젝트는 보다
전통적인 voice-command parser 쪽으로 기울 수 있다.

상호작용 패턴이 다음처럼 된다면 conversational character는 더 많이 줄어든다.

```text
Hey Jango, add milk.
Hey Jango, throw away the spinach.
Hey Jango, do we have eggs?
```

이 경우 핵심 과제는 ordinary conversation에 섞여 있는 actionable
information을 이해하는 것이 아니라, structured command parsing이 된다.

---

## 검토한 대안: activation에만 trigger 사용

절충안으로 다음 architecture를 검토했다.

```text
Hey Jango, we're making pasta tonight, but I think the spinach is old.
      |
      v
Wake-word detector removes the trigger
      |
      v
We're making pasta tonight, but I think the spinach is old.
      |
      v
Conversational NLU
```

이 설계에서는 trigger word가 product-level activation mechanism일 뿐이며,
language model이 의미 있는 feature로 사용하지 않게 된다.

downstream NLU problem은 여전히 다음처럼 분리할 수 있다.

1. **Activation**
   - wake word;
   - push-to-talk;
   - application listening state.

2. **Relevance detection**
   - actionable;
   - contextual or preference-related;
   - domain-related but non-actionable;
   - unrelated.

3. **Structured understanding**
   - intent;
   - action groups;
   - entity spans;
   - normalized values;
   - context resolution.

이 방식은 앞으로도 여전히 타당한 product architecture가 될 수 있다.

---

## 최종 결정

현재 personal project 단계에서는 **trigger word를 요구하지 않는 자연스러운
일상 발화**를 우선하는 dataset을 사용한다.

목표는 더 어렵고 더 흥미로운 language problem을 보존하는 것이다.

> 모든 입력이 이미 explicit command라고 가정하지 않고, ordinary conversation
> 속에서 actionable request, relevant state, useful context를 식별한다.

즉 예시는 다음처럼 포함될 수 있다.

```text
We probably need milk tomorrow.
```

가능한 해석:

```text
actionable
-> add_to_buy / mark_low depending on annotation convention and context
```

```text
I love oat milk.
```

가능한 해석:

```text
contextual / preference
-> no inventory action
```

```text
Milk is so expensive these days.
```

가능한 해석:

```text
domain-related but non-actionable
```

```text
I'm exhausted today.
```

가능한 해석:

```text
unrelated
```

```text
The spinach looks bad, maybe we should toss it.
```

가능한 해석:

```text
actionable
-> throw_away
-> ITEM: spinach
-> "looks bad" remains unlabeled state/intent context
```

---

## Annotation 설계에 대한 함의

annotation system은 먼저 utterance-level relevance를 표현하고, 그다음 intent,
action, entity, normalized value, phrase family를 통해 actionable structure를
표현한다.

구현된 pipeline은 다음과 같다.

```text
raw conversation utterance
        |
        v
relevance classification
  |-- actionable
  |-- contextual / preference
  |-- domain-related non-actionable
  `-- unrelated
        |
        v
if actionable:
  actions
  intents
  entities
  normalized values
  phrase families
```

이 분리는 두 가지 서로 다른 model capability를 따로 평가할 수 있게 해 준다.

1. 시스템이 action이 필요한 언어를 올바르게 식별하는가
2. action을 감지한 뒤 그 action을 올바르게 구조화하는가

### 구현된 annotation boundary

`annotation-v3`는 persisted boundary를 다음처럼 정의한다.

- annotations는 first-class `relevance` 값을 저장한다;
- allowed value는 `actionable`, `contextual_preference`,
  `domain_non_actionable`, `unrelated`이다;
- actionable annotation은 최소 하나의 structured action을 요구한다;
- non-actionable annotation은 inventory action을 저장하지 않는다;
- 기존 annotation client는 relevance가 생략되면 기본값 `actionable`을 써서
  계속 호환된다;
- migration `0008_add_annotation_relevance.sql` 실행 시, 기존 preference 및
  unrelated annotation은 phrase family를 기준으로 backfill된다.

production annotation UI는 이제 relevance-first workflow를 사용한다.
action과 entity control은 `actionable` utterance에서만 보이고, 나머지 세 class는
empty action list로 저장된다.

지원되지 않지만 이해 가능한 request는 여전히 `actionable`이며
`unknown > unsupported_request`를 사용한다. 이는 non-actionable utterance와는
다르다. `unknown`은 action은 존재하지만 현재 action taxonomy가 그것을 표현하지
못한다는 뜻이고, non-actionable relevance는 저장할 inventory action이 없다는
뜻이다.

### 구현된 dataset boundary

reviewed export는 네 가지 task mode를 지원한다.

| Export task | Included records |
| --- | --- |
| `relevance` | All four human-reviewed relevance classes |
| `intent` | Actionable records only |
| `slots` | Human-reviewed actionable records only |
| `joint` | Human-reviewed actionable records only |

relevance task는 non-actionable record에 대해 `actions: []`와 `intents: []`를
허용한다. 다른 task는 이런 record를 false `unknown` action으로 바꾸지 않고
그냥 제외한다. reviewed relevance가 non-actionable이라고 명시한 경우에는,
legacy action payload도 export에서 제거된다.

production relevance data는 다음 명령으로 export할 수 있다.

```bash
npm run dataset:export -- --remote --task relevance \
  --train-output ml/data/relevance-train.jsonl \
  --evaluation-output ml/data/relevance-evaluation.jsonl
```

train/evaluation 간 text duplication과 phrase-family leakage check는 그대로
적용된다. 생성된 파일에는 conversational data가 들어 있으므로 public
repository에 commit하면 안 된다.

### 구현된 relevance review queue

generated candidate는 세 개의 non-actionable review queue로 나뉜다.

| Queue | Candidate relevance | Purpose |
| --- | --- | --- |
| `preference_context` | `contextual_preference` | Preferences, goals, dietary constraints, and useful household context |
| `domain_non_actionable` | `domain_non_actionable` | Grocery-domain hard negatives with no immediate action |
| `unrelated_negative` | `unrelated` | A smaller set of outside-domain negatives |

candidate JSONL은 non-actionable example에서 intent를 생략할 수 있다.

```json
{"id":"pref-001","text":"I prefer oat milk in coffee.","relevance":"contextual_preference"}
{"id":"domain-001","text":"Milk has gotten expensive lately.","relevance":"domain_non_actionable"}
{"id":"negative-001","text":"The train was late again.","relevance":"unrelated"}
```

이 데이터는 기존 generated-review command로 import한다.

```bash
npm run annotation:import-generated -- --remote \
  --input path/to/relevance-candidates.jsonl \
  --label relevance-candidates-v1
```

importer는 generated value를
`inference_logs.request_context.candidate_relevance`에 저장한다. 이 값은
annotation이나 training label을 직접 쓰지 않는다. queue는 이 값을 routing에만
사용하고, web UI는 initial selection으로만 사용한다. annotator는 언제든지
변경할 수 있으며, 최종 human-saved `annotations.relevance`만이 ground truth다.

이 분리는 circular keyword classifier가 되는 것을 막는다. 예를 들어 queue가
`prefer`가 들어간 문장은 모두 contextual이고, `milk`가 들어간 문장은 모두
actionable이라고 추론해서는 안 된다. candidate generation과 human annotation은
분리된 단계로 유지된다.

일반 `generated_review` queue는 non-actionable candidate relevance가 들어 있는
record를 제외하므로, actionable synthetic review와 relevance review가
조용히 섞이지 않는다. 새 queue는 적절한 candidate JSONL을 import하기 전까지는
비어 있다. 즉 이 구현은 collection infrastructure를 제공할 뿐,
automatically generated relevance corpus를 바로 넣어 주는 것은 아니다.

repository에는 이제 이 import step을 위한 첫 corpus로
`relevance-candidates-v1`이 포함되어 있다. 이 corpus는 35개 phrase family에
걸쳐 200개의 contextual/preference candidate, 300개의
domain-non-actionable hard negative, 100개의 unrelated negative를 담고 있다.
여기 들어 있는 generated value 역시 candidate routing metadata일 뿐이며,
committed candidate file이 추가되었다고 해서 human-ground-truth policy가
바뀌지는 않는다.

### 구현 커밋

- `b59d137`: first-class annotation relevance persist 및 migration `0008` 추가
- `7f4074f`: `/annotate`를 relevance-first로 변경
- `5572798`: relevance-specific reviewed dataset export 추가
- `006c532`: generated relevance review queue와 candidate routing 추가
- `b4a31e8`: conversation/activation metadata 보존

---

## Dataset 우선순위

dataset은 완전히 unrelated한 speech에 과도하게 투자하지 않아야 한다.

권장 상대 우선순위는 다음과 같다.

### 높은 우선순위

- 자연스러운 actionable utterance;
- implicit request;
- multi-action utterance;
- clarification이 필요한 ambiguous request;
- unsupported but clearly understood request;
- domain-adjacent non-actionable utterance;
- 이후 conversational modeling에서 중요해질 수 있는 preference 및 context
  statement.

### 낮은 우선순위

- 완전히 unrelated한 statement;
- 완전히 unrelated한 question.

완전히 unrelated한 예시는 작은 negative set으로는 유지하되, 수집의 대부분을
차지할 필요는 없다.

---

## Privacy and Storage 결정

현재는 personal research project이기 때문에, data-collection workflow에 큰 규모의
privacy infrastructure를 도입하지 않고도 가볍게 운영할 수 있다.

하지만 raw everyday conversation에는 의도치 않게 다음 정보가 들어갈 수 있다.

- 이름;
- 주소;
- 전화번호;
- 회사나 조직 이름;
- 계정 정보;
- 기타 개인 정보.

따라서 실무 정책은 다음과 같다.

1. raw conversational data는 실험을 위해 private/local database에 보관할 수 있다;
2. raw conversation dataset은 public GitHub repository에 자동으로 commit하지
   않는다;
3. training 또는 evaluation export는 필요에 따라 명백하게 민감하거나 관계없는
   개인 정보를 제거해야 한다;
4. public repository 예시는 synthetic, anonymized, 또는 manually reviewed
   excerpt를 사용한다.

이렇게 하면 프로젝트를 실용적으로 유지하면서도 conversational data를 불필요하게
노출하지 않을 수 있다.

---

## Project Positioning

결과적으로 이 프로젝트는 다음처럼 설명할 수 있다.

> fixed command syntax를 요구하지 않고, 자연스러운 일상 언어에서 actionable
> request, relevant state, contextual information을 식별하는 conversational
> kitchen intelligence system

나중에 trigger word를 도입하더라도, 그것은 가능하면 language-model task의
일부가 아니라 activation-layer feature로 남아 있어야 한다.

### 구현된 metadata boundary

interpretation request는 이제 optional metadata를 받을 수 있다.

- `conversation_id`: 하나의 conversation에 속한 turn들이 공유하는 UUID;
- `turn_index`: zero-based 또는 monotonically increasing turn position이며,
  `conversation_id`가 있을 때만 유효;
- `speaker_role`: `user`, `assistant`, 또는 `system`;
- `activation_mode`: `manual_text`, `push_to_talk`, `wake_word`, 또는
  `always_listening`.

Worker와 local API는 이 값을 inference `request_context`에 저장하고, reviewed
dataset export도 이를 보존한다. 기존 client는 네 필드를 모두 생략해도 된다.
현재 parser는 previous turn을 읽지 않으므로, 이 기능은 context resolver가
아니라 collection/replay foundation이다.

현재 manual web request는 `speaker_role = user`,
`activation_mode = manual_text`로 기록된다. 이후 Raspberry Pi 또는 speech
client는 utterance schema를 바꾸지 않고도 다른 activation mode를 쓸 수 있다.

`wake_word`의 경우 upstream activation layer가
`POST /commands/interpret` 전에 trigger를 제거해야 한다. 예를 들어 저장되는
NLU text는 `Hey Jango, we're almost out of milk`가 아니라
`We're almost out of milk`여야 한다. 그래야 downstream model이 trigger를
relevance shortcut으로 사용하지 않게 된다.

이 metadata field는 기존 `request_context` JSON을 사용하므로 database
migration이 필요 없다. 다만 API와 web 변경 배포는 필요하다. earlier
first-class annotation relevance column을 추가한 migration `0008`은 별도다.

### 현재 구현 한계

- 아직 trained relevance classifier는 배포되지 않았다.
- 새 relevance queue는 candidate data를 import하기 전까지 record가 비어 있다.
- candidate relevance는 calibrated model output이 아니며 confidence-bearing
  supervision으로 취급하면 안 된다.
- conversation metadata는 저장되지만 turn 간 pronoun, ellipsis, reference는
  해소되지 않는다.
- wake-word detection, speech segmentation, ASR은 여전히 upstream future
  component다.
- relevance accuracy를 쉬운 예시로 부풀리지 않으려면, fully unrelated
  negative는 domain-adjacent hard negative보다 적은 비중을 유지해야 한다.

---

## 현재 결정 요약

- 현재 data-collection 및 annotation phase에서는 trigger word를 요구하지 않는다.
- 자연스러운 everyday conversational utterance를 수집한다.
- unrelated 및 non-actionable example도 negative coverage로 유지한다.
- 완전히 unrelated한 speech를 많이 모으는 것보다 domain-adjacent
  non-actionable example을 우선한다.
- generated relevance candidate는 별도 review queue로 보내고, 그 label은
  ground truth가 아니라 suggestion으로만 취급한다.
- human-reviewed annotation을 ground truth로 유지한다.
- 구현된 relevance label 및 export를 별도의 utterance-level training task로
  사용한다.
- 나중에 wake word를 추가하더라도 activation mechanism으로만 취급하고,
  downstream NLU 전에 제거한다.
- conversation, turn, speaker, activation metadata는 normalized NLU text와
  분리해 보존한다.
- raw conversational dataset은 private하게 유지하고, 공개 시에는
  reviewed/anonymized example이나 derived artifact만 배포한다.
