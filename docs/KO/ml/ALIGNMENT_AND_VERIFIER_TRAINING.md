# SFT, PPO, DPO, GRPO와 Jangoing 적용 메모

## 목적

이 문서는 Jangoing에서 future model training을 논의할 때 자주 나오는
`SFT`, `PPO`, `DPO`, `GRPO`를 정리하고, 각각이 annotation-driven kitchen NLP
project에 어떤 식으로 맞거나 맞지 않는지 설명한다.

핵심 질문은 다음이다.

- reviewed annotation으로 먼저 무엇을 학습해야 하는가
- preference pair는 언제 필요한가
- verifier-based reward는 어디까지 현실적인가
- conversational context는 어떤 방식으로 다뤄야 하는가

## 1. 한 줄 정의

- `SFT`: 정답 출력 쌍으로 직접 supervised fine-tuning
- `PPO`: reward model을 따로 만들고 그 점수로 RL 업데이트
- `DPO`: reward model 없이 preference pair를 직접 target model 학습에 사용
- `GRPO`: preference pair 대신 verifier나 judge 기반 reward를 사용

## 2. 왜 Jangoing에서 중요한가

Jangoing은 자유 대화 생성 모델이 아니라, 다음과 같은 structured output을 필요로
한다.

- relevance
- action list
- intent
- entity span
- normalized value
- phrase family
- temporal grounding consistency

즉 단순 text generation보다 **structured decision quality**가 훨씬 중요하다.

예:

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "phrase_family": "state_out_of_entity",
      "entities": [
        {
          "label": "ITEM",
          "start": 12,
          "end": 16,
          "text": "milk",
          "normalized_value": "milk"
        }
      ]
    }
  ],
  "reference_date": "2026-09-01",
  "timezone": "America/Los_Angeles"
}
```

따라서 Jangoing의 training 기법은 “자연스러운 답변”보다, 이 구조를 얼마나 정확히
만드는가를 중심으로 평가해야 한다.

## 3. SFT

### 정의

`SFT`는 `Supervised Fine-Tuning`이다. 입력과 정답 출력 쌍을 직접 넣어서 모델이
정답 형식을 따라 하도록 학습한다.

예:

입력:

```text
We're out of milk.
```

정답:

```json
{
  "relevance": "actionable",
  "actions": [
    {
      "intent": "mark_out",
      "entities": [
        {
          "label": "ITEM",
          "text": "milk",
          "normalized_value": "milk"
        }
      ]
    }
  ]
}
```

### Jangoing에서의 역할

가장 먼저 해야 하는 것은 거의 항상 SFT다.

- reviewed annotation을 정답으로 사용 가능
- parser replacement 또는 annotation assistant의 기본 실력을 만들 수 있음
- relevance, intent, slots, joint task의 baseline이 됨

### 장점

- 구현이 가장 단순함
- 현재 프로젝트 데이터 구조와 가장 잘 맞음
- quality gate를 설정하기 쉬움
- reviewed annotation이 쌓이면 바로 확장 가능

### 한계

- “이 둘 중 어느 답이 더 낫다” 같은 preference 신호는 직접 쓰기 어려움
- ambiguous context behavior를 추가로 보정하려면 다른 방법이 필요할 수 있음

### 현재 권장 결론

Jangoing에서 **첫 learned model은 SFT 기반**이어야 한다.

## 4. PPO

### 정의

`PPO`는 preference pair로 학습한 `reward model`을 사용해 target model을
강화학습하는 방법이다.

흐름:

```text
preference pairs
-> reward model 학습
-> reward model이 target model 출력 채점
-> PPO로 target model 업데이트
```

### Jangoing 예시

같은 prompt에 대해 두 개의 structured output이 있고, annotator가 더 나은 것을
고른다.

예:

- A: `mark_out + add_to_buy`
- B: `mark_low`만 생성

annotator가 A가 더 낫다고 판단하면, reward model은 multi-action과 intent choice
선호를 일반화해서 배울 수 있다.

### 장점

- preference를 일반화하는 reward model을 만들 수 있음
- reward model이 직접 보지 않은 출력에도 점수 부여 가능
- 사람이 더 선호하는 annotation proposal 방향으로 모델을 align할 수 있음

### 단점

- 구조가 무거움
- reward model dataset이 따로 필요함
- 계산 비용이 큼
- reward hacking, instability, implementation risk가 큼

### 현재 권장 결론

Jangoing에는 아직 과하다. preference pair 규모와 reward model 운영 정당성이
충분히 생긴 뒤에나 고려할 수 있다.

## 5. DPO

### 정의

`DPO`는 reward model 없이 preference pair를 바로 target model에 넣어
`chosen` 응답 확률은 올리고 `rejected` 응답 확률은 내리는 방식이다.

흐름:

```text
prompt + chosen/rejected pair
-> chosen 확률 올림
-> rejected 확률 내림
```

### Jangoing에서 pair를 만들 수 있는 곳

- parser prediction vs final reviewed annotation
- assistant draft vs final reviewed annotation
- accepted_as_is draft vs heavily edited draft

예:

- rejected: parser가 `add_item`으로 잘못 해석
- chosen: human review가 `update_expiry`로 수정

### 장점

- PPO보다 훨씬 단순함
- reward model이 필요 없음
- 현재 correction workflow와 잘 맞음
- annotation assistant quality 개선에 유리함

### 단점

- chosen/rejected pair가 명확히 있어야 함
- pairwise supervision이 없는 clean annotation은 그대로 쓰기 어려움
- 어떤 부분이 틀렸는지 세분화 없이 전체 응답을 밀고 당기는 경향이 있음

### 현재 권장 결론

Jangoing에서는 **PPO보다 DPO가 훨씬 현실적**이다. 특히 annotation assistant나
parser-to-model 전환 단계에서 유망하다.

## 6. GRPO

### 정의

`GRPO`는 preference pair 대신 verifier나 judge 기반 reward를 사용한다.

핵심은 같은 prompt에 대해 여러 completion을 만들고, 각 completion reward를 그
prompt group 평균과 비교하는 상대적 보상 구조다.

즉:

```text
prompt
-> multiple completions
-> verifier scoring
-> group-relative reward
-> policy update
```

### Jangoing에서 가능한 verifier 예시

#### 형식 verifier

- JSON schema valid
- relevance/intent/label이 허용된 값인지
- phrase family가 해당 intent에 허용되는지

#### span verifier

- `raw_utterance.slice(start, end) === text`
- span overlap 없음
- start/end 범위 유효

#### normalization verifier

- normalized value가 canonical list 안에 존재
- `LOCATION`이 허용 set 안에 존재
- date format이 `YYYY-MM-DD`

#### temporal verifier

- `next Friday`가 stored `reference_date` 기준으로 일관적인가
- timezone과 normalization 결과가 모순되지 않는가

#### ontology verifier

- non-actionable relevance인데 action list가 비어 있지 않으면 penalty
- `shopping list`가 있는데 `add_to_buy`가 없으면 penalty
- `out of`인데 `mark_low`만 내면 penalty

### 장점

- preference pair를 대량으로 만들 필요가 없음
- annotation convention을 verifier 규칙으로 바꾸기 쉬움
- domain-specific checker를 계속 추가할 수 있음
- structured output task와 잘 맞음

### 단점

- verifier가 좋아야 함
- reward shaping이 어렵다
- 너무 쉬운 task나 너무 어려운 task는 학습 신호가 약함
- semantic nuance를 deterministic verifier만으로 잡기 어려움

### 현재 권장 결론

Jangoing에서는 GRPO가 **structured consistency 강화용**으로는 현실적이다.
하지만 전체 conversational meaning을 한 번에 해결하려는 도구로 쓰면 어렵다.

## 7. GRPO에서 가장 어려운 것: Context Reading

### 핵심 판단

GRPO에서 가장 어려운 부분은 **context-reading verifier 설계**다.

schema, span, normalized value, temporal grounding은 비교적 기계적으로 검사할
수 있지만, 문맥 이해는 다음 문제를 자주 포함한다.

- 숨은 의도 추론
- 대명사 해석
- 선호와 즉시 행동의 구분
- 여러 turn에 걸친 state carry
- 말은 맞지만 실제 행동으로 이어지지 않는 경우

이건 verifier가 정답 여부를 코드로 딱 잘라 판단하기 어렵다.

### 현실적인 전략

GRPO는 Jangoing 전체 문맥 문제를 한 번에 풀기보다는, **검증 가능한 하위
문맥 기술(subtasks)** 에만 쓰는 것이 적절하다.

즉:

```text
context understanding itself -> hard for GRPO
context consistency and structured resolution -> feasible for GRPO
```

### GRPO로 비교적 가능한 context verifier

- 직전 turn entity를 정확히 다시 가리켰는가
- `it`, `that`, `those`가 실제 prior candidate와 연결되는가
- 선택한 antecedent가 prior turn text에 실제 존재하는가
- 현재 output이 이전 confirmed state와 모순되지 않는가
- relative date가 stored `reference_date` 기준으로 일관적인가
- context field를 썼다면 그 evidence가 실제 prior turn에 존재하는가

예:

```text
User: We bought oat milk yesterday.
User: Put it in the fridge.
```

여기서는 다음 정도는 비교적 검증 가능하다.

- `it` referent가 prior context에 존재하는가
- chosen referent가 `oat_milk`인가
- location intent가 `fridge`와 연결되는가

### GRPO로 어려운 context verifier

- 이 문장은 preference인가 action인가
- 이 문맥에서 사용자는 정말 무엇을 원하는가
- household habit인가 일회성인가
- 말하지 않은 전제를 적절히 추론했는가
- `add_to_buy`와 `mark_low` 사이의 미묘한 pragmatic choice

예:

```text
We're having guests tomorrow, so maybe grab more drinks.
```

이 경우 아래가 한 번에 섞인다.

- 실제 action 요청인지
- preference/context인지
- `grab more drinks`가 `add_to_buy`인지 suggestion인지

이런 open-ended pragmatic interpretation은 deterministic verifier가 약하다.

### output schema를 바꿔서 verifier를 만들 수 있음

문맥 해석 일부를 hidden reasoning으로 두지 말고 explicit field로 빼면 verifier를
만들기 쉬워진다.

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
- `resolved_to`가 prior context에 실제 존재하는가
- `evidence_turn_index`가 유효한가

즉 verifier를 잘 설계하려면 문맥 해석 결과 일부를 explicit structured output으로
끌어내야 한다.

## 8. Jangoing에서의 현실적인 역할 분리

현재 기준으로는 다음 역할 분리가 가장 자연스럽다.

- `SFT`: 기본 context reading과 structured output 능력 학습
- `GRPO`: schema, action count, antecedent existence, temporal consistency,
  state consistency, allowed ontology 같은 구조적 correctness 강화
- `DPO` 또는 human preference: relevance 경계, implicit action,
  preference vs actionable, clarification 필요 여부 같은 애매한 해석 보정
- `PPO`: 충분한 규모와 운영 복잡도를 감당할 수 있을 때 나중에 검토

## 9. Jangoing에 맞는 실제 우선순위

현재 단계에서는 RL 계열보다 먼저 해야 할 일이 더 분명하다.

1. reviewed annotation 계속 확장
2. task별 baseline 구축
   - relevance
   - intent
   - slots
   - joint
3. deterministic verifier 설계
4. parser/draft vs final reviewed annotation pair logging 정리
5. 그 이후 DPO 또는 GRPO 실험

### 추천 순서

```text
SFT
-> verifier design
-> DPO-ready pair collection
-> GRPO on verifier-friendly subtasks
-> DPO for proposal quality
-> PPO only if clearly justified later
```

## 10. Jangoing 기준 최종 결론

- `SFT`: 지금 당장 가장 중요한 학습 방식
- `DPO`: annotation assistant와 parser replacement 품질 보정에 현실적
- `GRPO`: structured consistency와 narrow context subtasks에는 유망
- `PPO`: 장기적으로 가능하지만 현재는 과함

즉 Jangoing에서는 **reviewed supervised baseline + verifier design + pair logging
design**이 먼저고, RL 계열은 그 다음 문제다.
