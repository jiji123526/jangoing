# Language Engineer에게 물어볼 질문

## 목적

이 문서는 Jangoing의 annotation workflow와 data feeding method를 개선하기 위해
Language Engineer와 대화할 때 사용할 질문 목록이다.

막연하게 `이 프로젝트 어떠세요?`를 묻기보다, 이미 구현된 구조를 기준으로
annotation ontology, queue 운영, dataset export, model training 순서를 점검하는
질문으로 좁히는 것이 목적이다.

## 현재 프로젝트 전제

질문 전에 다음 전제를 짧게 공유하면 답변 품질이 좋아진다.

- Jangoing은 영어 텍스트 기반 kitchen inventory NLP MVP다.
- 현재는 rule-based parser와 human confirmation flow가 먼저 구현되어 있다.
- annotation은 relevance -> action -> intent -> entity span -> normalized value
  -> phrase family 순서로 저장한다.
- relevance class는 `actionable`, `contextual_preference`,
  `domain_non_actionable`, `unrelated` 네 가지다.
- dataset source는 실제 correction data, confirmed data, generated review,
  synthetic bootstrap, relevance candidate queue가 섞여 있다.
- export는 `relevance`, `intent`, `slots`, `joint` task 단위로 분리할 수 있다.
- expiry/date는 `reference_date`와 `timezone`을 함께 저장한다.
- 장기적으로는 TF-IDF baseline 이후 DistilBERT-class model, context-aware
  model, 그리고 voice workflow까지 확장할 계획이다.

## 가장 먼저 물어볼 5개

시간이 짧으면 아래 다섯 개만 물어봐도 충분하다.

1. 현재 `relevance -> intent -> entity -> normalized value` annotation 구조가
   초기 English household NLP MVP에 적절한가, 아니면 먼저 단순화해야 할 부분이
   있는가?
2. synthetic data, generated review data, real correction data를 어떤 순서와
   비율로 학습에 넣는 것이 가장 안전한가?
3. multi-action annotation을 지금부터 유지하는 것이 맞는가, 아니면 초기 baseline은
   single-action only로 제한하는 것이 더 나은가?
4. normalized value를 annotation 시점에 강하게 canonicalize하는 현재 방식이
   적절한가, 아니면 raw mention과 canonical mapping을 더 분리해야 하는가?
5. 지금 annotation queue 우선순위를 무엇으로 두는 것이 가장 효율적인가?
   `expiry`, `domain_non_actionable`, `generated_review`, `correction`,
   `low_confidence` 중 어떤 순서가 적절한가?

## 1. Annotation Ontology

### relevance 설계

- `actionable`, `contextual_preference`, `domain_non_actionable`, `unrelated`
  네 클래스가 현재 목적에 적절한가?
- `domain_non_actionable`와 `contextual_preference`의 경계를 더 명확히 나눠야
  하는가, 아니면 초기 모델에서는 합치는 것이 더 나은가?
- `needs_clarification`과 `unknown`을 intent로 두는 방식이 맞는가, 아니면 별도
  metadata나 rejection class로 다루는 것이 더 나은가?
- wake word 없는 conversational setting을 전제로 할 때, relevance classifier를
  먼저 독립적으로 강하게 만드는 것이 맞는가?

### intent 설계

- 현재 intent set이 너무 세분화되어 있는가, 아니면 오히려 product action과 잘
  대응하는가?
- `mark_low`, `mark_out`, `add_to_buy`는 annotation상 분리하는 것이 맞는가?
- `set_low_threshold`를 일반 inventory update와 분리한 것이 타당한가?
- `query_inventory`를 action intent와 같은 ontology 안에 두는 것이 적절한가?

### multi-action 설계

- `We're out of milk, add it to the list` 같은 문장을 action list로 저장하는
  구조가 학습에 실제로 유리한가?
- 초기 baseline에서는 multi-action 데이터를 제외하고 single-action만 먼저
  학습하는 것이 더 좋은가?
- multi-action을 유지한다면 export와 evaluation은 어떤 단위로 해야 하는가?
  utterance-level, action-level, both 중 무엇이 적절한가?

### phrase family 효용

- phrase family를 annotator가 직접 붙이는 현재 방식이 downstream modeling이나
  error analysis에 충분한 가치를 주는가?
- phrase family는 지금처럼 학습 데이터 metadata로 유지하는 것이 좋은가, 아니면
  분석 전용으로만 두는 것이 나은가?
- annotator burden 대비 phrase family granularity가 너무 세밀한 편은 아닌가?

## 2. Entity와 Normalization

### entity span 설계

- exact span labeling 위주의 현재 규칙이 token classification training에
  적절한가?
- 일부 표현은 더 넓게 잡는 것이 좋은가, 아니면 지금처럼 최소 의미 span이
  맞는가?
- `out of`, `low on`, `spoiled`, `ripe` 같은 표현을 entity가 아니라 raw context로
  남기는 현재 결정이 적절한가?

### generic vs specific item

- `milk`와 `whole_milk`, `crackers`와 `saltine_crackers`처럼 generic mention과
  specific mention을 어떻게 분리 운영하는 것이 가장 좋은가?
- annotation은 mention-level specificity를 유지하고 runtime resolution에서만
  household-specific linking을 하는 현재 방향이 타당한가?
- generic item mention이 많은 환경에서 canonical taxonomy를 어떤 수준으로 설계해야
  annotation과 inference가 둘 다 지나치게 흔들리지 않는가?

### normalized value governance

- normalized value를 annotation 시점에 강하게 강제하는 것이 좋은가?
- raw mention, canonical mention, runtime-linked household item id를 세 층으로
  분리해야 하는가?
- annotator가 새 canonical value를 직접 추가할 수 있게 한 현재 방식은 빠르지만
  drift 위험이 있다. 어떤 governance가 최소 필요 조건인가?
- canonical value 변경이나 merge가 필요할 때, annotation history를 어떻게
  versioning하는 것이 바람직한가?

## 3. Queue와 Annotation Workflow

### queue 우선순위

- 현재 queue 우선순위를 `expiry -> domain_non_actionable ->
  preference_context -> generated_review -> low_confidence -> correction`으로
  두는 것이 타당한가?
- 실제 production correction data가 적은 초기에 generated review를 많이 쓰는
  것이 적절한가?
- 언제부터 synthetic/generated 중심에서 actual-user correction 중심으로
  annotation 우선순위를 전환해야 하는가?

### annotator efficiency

- AI draft를 prefill로 쓰는 방식이 annotation 속도를 높이지만 bias를 키울 수 있다.
  어떤 audit 방식이 필요할까?
- phrase family, normalized value, entity span 중 어떤 필드는 AI prefill이
  상대적으로 안전하고, 어떤 필드는 인간이 직접 결정해야 하는가?
- disagreement measurement를 하려면 어떤 샘플들을 이중 라벨링하는 것이 가장
  효율적인가?

### reviewed dataset quality

- 어떤 시점부터 2차 QA 또는 random audit가 필수인가?
- exact duplicate, alias-only duplicate, phrase-family template leakage를 어떤
  기준으로 제거하는 것이 적절한가?
- evaluation candidate는 annotation 단계에서 미리 분리하는 방식이 맞는가, 아니면
  freeze 시점에만 분리하는 것이 더 나은가?

## 4. Data Feeding Method

### source mixing

- reviewed dataset에 `synthetic`, `generated_review`, `correction`,
  `confirmed_unannotated`, `assistant_prefilled` provenance를 함께 두고 있는데,
  training에서는 어떤 수준으로 분리 또는 weighting해야 하는가?
- synthetic은 warm start용, generated review는 coverage 확장용, correction은
  production error repair용이라는 역할 분리가 타당한가?
- 실제 학습에서는 source별 샘플 가중치나 curriculum learning이 필요한가?

### task 분리

- `relevance`, `intent`, `slots`, `joint` export를 지금처럼 분리하는 것이
  적절한가?
- relevance classifier와 intent classifier를 완전히 분리 학습하는 것이 초기에는
  더 나은가?
- joint model을 너무 빨리 시도하면 dataset sparsity 때문에 손해가 큰가?

### hard negatives

- `domain_non_actionable`를 현재 별도 relevance queue로 집중 수집하는 전략이
  타당한가?
- unrelated보다 domain-adjacent hard negative를 더 많이 모으는 것이 실제로
  relevance robustness에 더 중요하다고 봐야 하는가?
- intent model training에도 이런 hard negative를 어떤 방식으로 포함하는 것이
  좋은가?

### temporal data

- relative date expression은 annotation/export에 `reference_date`와 `timezone`을
  저장하고 있다. 이것만으로 재현성에 충분한가?
- temporal sample은 rare slice로 oversample해야 하는가?
- expiry/date normalization은 parser stage와 slot model stage 중 어디까지를
  분리하는 것이 좋은가?

## 5. Model Training Strategy

### baseline 순서

- 현재 계획처럼 TF-IDF baseline -> DistilBERT intent/relevance ->
  token-classification slot model 순서가 적절한가?
- first useful model을 intent-only로 먼저 만드는 것이 좋은가, 아니면 relevance와
  intent를 함께 묶어야 하는가?
- slot model은 언제 시작하는 것이 적절한가? reviewed `ITEM` span, `EXPIRY_DATE`
  span, `QUANTITY`/`UNIT` coverage가 어느 정도 쌓인 뒤가 적절한가?

### low-resource setting

- reviewed data가 아직 많지 않은 단계에서 pretrained encoder를 쓰는 것이
  rule-based + shallow model보다 확실히 이득인가?
- small dataset에서 synthetic pretraining이나 weak supervision을 어떤 방식으로
  사용하는 것이 가장 덜 위험한가?
- single-action only baseline을 먼저 만든 뒤 multi-action parsing으로 확장하는 것이
  일반적으로 좋은 전략인가?

### confidence와 calibration

- 현재 parser confidence는 calibrated score가 아니다. learned model로 넘어갈 때
  어떤 calibration 전략을 써야 queue routing과 human review priority에 도움이
  되는가?
- low-confidence queue를 active learning queue로 바로 쓰는 것이 적절한가?

## 6. Evaluation과 Leakage

- 지금 프로젝트에서 가장 위험한 leakage는 exact duplicate, paraphrase template,
  alias-only variation, same household distribution 중 무엇인가?
- `milk`, `whole_milk`, `oat_milk` 같은 family를 split할 때 어떤 기준이 가장
  정직한 evaluation을 만들까?
- synthetic template와 human-reviewed paraphrase가 섞일 때 evaluation set은 어떻게
  분리해야 가장 공정한가?
- slot evaluation은 exact span match, normalized value accuracy,
  intent-conditioned slot accuracy 중 무엇을 핵심 지표로 봐야 하는가?

## 7. Conversation 확장

- 현재는 `conversation_id`, `turn_index`, `speaker_role`, `activation_mode`만
  저장한다. context-aware model을 하려면 어떤 annotation이 추가로 필요한가?
- `Put that on the list` 같은 anaphora나 elliptical utterance를 다루려면 지금부터
  어떤 형태의 conversation dataset을 모아야 하는가?
- preference/context dataset을 action dataset과 분리해 쌓는 현재 전략이 장기적으로
  맞는가?

## 8. GRPO와 Context Reading 경계

여기서 `SFT`는 `Supervised Fine-Tuning`을 뜻한다. 즉 reviewed annotation 같은
입력-정답 쌍으로 직접 supervised learning을 하는 기본 학습 단계다.

### 핵심 관찰

- GRPO에서 비교적 다루기 쉬운 것은 schema, span, normalized value, temporal
  grounding 같은 구조적 correctness다.
- 반대로 full context reading은 verifier로 딱 잘라 채점하기 어렵다.
- 따라서 context-aware modeling에서는 `context understanding itself`와
  `context output consistency`를 분리해 생각해야 한다.

### 왜 어려운가

문맥 이해는 종종 다음 문제를 포함한다.

- 숨은 의도 추론
- 대명사 해석
- 선호와 즉시 행동의 구분
- 여러 turn에 걸친 state carry
- 말은 맞지만 실제로는 행동으로 이어지지 않는 경우

이런 문제는 deterministic verifier가 정답 여부를 강하게 판정하기 어렵다.

### GRPO로 비교적 가능한 context verifier

- 직전 turn에 나온 entity를 정확히 다시 가리켰는가
- `it`, `that`, `those`가 실제 context candidate 중 하나와 연결되는가
- 선택한 antecedent가 이전 turn text에 실제로 존재하는가
- 현재 output이 이전 confirmed state와 모순되지 않는가
- relative date가 저장된 `reference_date` 기준으로 일관적인가
- context field를 썼다면 그 evidence가 실제 prior turn에 있는가

예:

```text
User: We bought oat milk yesterday.
User: Put it in the fridge.
```

이 경우 verifier는 다음을 볼 수 있다.

- `it`의 referent가 prior context에 존재하는가
- chosen referent가 `oat_milk`인가
- location intent가 `fridge`와 연결되는가

### GRPO로 어려운 context verifier

- 이 문장은 preference인가 action인가
- 이 문맥에서 사용자는 정말 뭘 원한 것인가
- 이건 household habit인가 일회성인가
- 말하지 않은 전제를 모델이 적절히 추론했는가
- 이 정도 암시는 `add_to_buy`인가 `mark_low`인가

예:

```text
We're having guests tomorrow, so maybe grab more drinks.
```

이 경우에는 아래가 한 번에 섞인다.

- 실제 action 요청인지
- preference/context인지
- `grab more drinks`가 `add_to_buy`인지 suggestion인지

즉 open-ended pragmatic interpretation이 들어오면 deterministic verifier가
약해진다.

### 현실적인 전략

1. `SFT`로 기본 context behavior를 먼저 학습한다.
2. `GRPO`는 검증 가능한 부분에만 사용한다.
3. `DPO`나 human preference는 애매한 문맥 해석에 사용한다.

권장 역할 분리는 다음과 같다.

- `SFT`: 기본 context reading
- `GRPO`: schema, action count, antecedent existence, temporal consistency,
  state consistency, allowed ontology 같은 구조적 일관성
- `DPO` 또는 human preference: relevance 경계, implicit action,
  preference vs actionable, clarification 필요 여부

즉 문맥 의미 자체는 SFT/DPO가 더 강하고, GRPO는 문맥을 읽은 뒤 나온 output의
구조적 정합성을 강화하는 쪽이 더 적합하다.

### output을 바꿔야 verifier가 생길 수 있음

final answer만 자유 생성하게 두면 verifier가 어렵다. 대신 일부 intermediate field를
명시적으로 출력하게 하면 context verifier를 만들기 쉬워진다.

예:

```json
{
  "context_resolution": {
    "used_prior_turn": true,
    "referents": [
      {
        "surface": "it",
        "resolved_to": "oat_milk",
        "evidence_turn_index": 3
      }
    ]
  },
  "actions": []
}
```

이 경우 verifier는 다음을 체크할 수 있다.

- `used_prior_turn`이 맞는가
- `resolved_to`가 prior context에 실제 있는가
- `evidence_turn_index`가 유효한가

즉 hidden reasoning을 그대로 믿기보다, 문맥 해석 일부를 explicit structured
output으로 끌어내야 verifier가 생긴다.

### 좋은 GRPO용 context task

- 직전 1~2 turn만 보고 대명사 해석
- 이전 turn item을 다시 참조하는지 판정
- 이전 confirmed inventory state와 contradiction이 있는지 판정
- temporal reference carryover
- speaker role에 따라 assistant text를 무시해야 하는지 판정

### 비권장 GRPO용 context task

- household-level long-term preference 전체 추론
- open-ended conversational relevance 전체 판정
- ambiguous multi-party dialogue intent 해석
- unstated goals까지 포함한 pragmatic inference

### LLM-as-a-judge 위치

LLM-as-a-judge는 쓸 수 있지만 주 verifier로 쓰기에는 불안정하다.

- deterministic하지 않음
- 같은 답에 judge variance가 생김
- subtle context case에서 judge도 흔들림
- reward hacking 가능성 큼

따라서 주 verifier가 아니라, deterministic verifier가 못 잡는 일부 semantic check
보조로 쓰는 것이 더 안전하다.

### 이 주제에 대해 Language Engineer에게 직접 물어볼 질문

```text
For context-aware NLP tasks, where would you draw the boundary between SFT/DPO
and GRPO?

More specifically:
- Which context-reading behaviors are too ambiguous for deterministic verifiers?
- Are there narrow subtasks, such as pronoun resolution, temporal carryover, or
  prior-state consistency, that you think are realistic GRPO targets?
- If you were designing the pipeline, would you keep context reading mostly in
  SFT/DPO and use GRPO only for structured consistency checks?
```

짧게 요약하면:

```text
context understanding itself -> hard for GRPO
context consistency and structured resolution -> feasible for GRPO
```

## 9. 미팅에서 바로 써도 되는 짧은 질문 세트

아래는 그대로 복사해도 되는 버전이다.

```text
I'm building an English household inventory NLP system with annotation structured as:
relevance -> action groups -> intent -> entity spans -> normalized values -> phrase family.

I already have:
- rule-based parser
- human confirmation before state changes
- reviewed annotation queues
- synthetic/generated/correction data sources
- task-specific export for relevance / intent / slots / joint
- temporal grounding with stored reference_date and timezone

Given this setup, I would love your opinion on:

1. Is this annotation ontology too ambitious for an MVP, or is it a reasonable structure?
2. Should I keep multi-action annotations now, or simplify the first training baseline to single-action only?
3. How should I mix synthetic data, generated review data, and real correction data during training?
4. Am I over-canonicalizing normalized values too early at annotation time?
5. Which queue should I prioritize now for the highest model improvement:
   expiry, domain_non_actionable, generated_review, low_confidence, or correction?
6. For relevance modeling, do you agree that domain-adjacent hard negatives are more valuable than fully unrelated negatives?
7. What dataset leakage risks would you watch most carefully in this setup?
8. At what point is there enough reviewed data to justify training the first slot model?
```

## 10. 추천 사용 방법

- 미팅 전에 이 문서 전체를 보내기보다 `가장 먼저 물어볼 5개`만 먼저 보낸다.
- 답변이 구체적으로 들어오면 해당 영역의 세부 질문을 추가로 보낸다.
- 답변을 받은 뒤에는 annotation convention, queue priority, export rule, model
  baseline 순서 중 어디를 바꿔야 하는지 별도 결정 문서로 정리한다.
