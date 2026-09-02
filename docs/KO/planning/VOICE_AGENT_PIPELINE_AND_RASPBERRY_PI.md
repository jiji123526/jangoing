# Voice Agent Pipeline과 Raspberry Pi 계획

## 목적

이 문서는 Jangoing에 voice interface를 붙일 때 필요한 시스템 구조를 정리한다.

핵심은 다음 두 가지다.

- AI voice agent는 단순히 STT와 TTS를 붙이는 문제가 아니다.
- Raspberry Pi는 충분히 음성 입출력 장치가 될 수 있지만, 무엇을 로컬에서 하고
  무엇을 클라우드에서 할지 분리해야 한다.

## 1. 핵심 요약

AI voice agent는 보통 세 기술을 겹쳐서(streaming) 동작시킨다.

- `ASR`: 사용자의 음성을 실시간 텍스트로 변환
- `LLM/NLU`: 의미를 해석하고 다음 행동을 결정
- `TTS`: 답변을 자연스러운 음성으로 출력

이 세 단계가 순차적으로 완전히 끝난 뒤 다음 단계가 시작되면 latency가 너무 커져
자연스러운 대화처럼 느껴지지 않는다. 따라서 실서비스는 각 단계를 겹쳐서 돌린다.

## 2. 일반적인 speech-to-speech 파이프라인

### Stage 1: Audio capture

- 마이크 입력 수집
- telephony 또는 디지털 채널 연결
- echo cancellation, noise suppression, gain control

### Stage 2: ASR

- streaming partial transcript 생성
- finalization과 endpoint detection 수행
- accent, code-switching, item name, alphanumeric recognition 품질이 중요

### Stage 3: Understanding and reasoning

- transcript 해석
- prior turn, user profile, inventory state, enterprise knowledge 참조
- LLM, intent model, deterministic rules, policy guardrails 조합 가능

### Stage 4: Action and orchestration

- inventory lookup
- shopping list mutation
- CRM, account, scheduling, payment 같은 external tool 호출
- 가능한 경우 작업을 병렬화해 latency를 줄임

### Stage 5: TTS

- streaming TTS로 time-to-first-audio를 최소화
- voice, prosody, domain-specific pronunciation 조정

## 3. 왜 latency budget이 중요하나

사람 대화는 턴 사이의 침묵이 길어지면 바로 어색해진다. 대략 1초 안팎이 전체
응답 budget이라고 볼 수 있다.

그 안에서 다음이 시간을 나눠 쓴다.

- endpoint detection
- ASR finalization
- LLM/NLU inference
- tool/API latency
- TTS first audio
- network and media overhead

따라서 voice 품질은 단일 모델 정확도보다 **end-to-end latency budget 관리**에 더
강하게 좌우된다.

## 4. Turn-taking과 barge-in

voice 시스템에서 가장 사람다움을 좌우하는 부분이다.

- caller가 agent 말 중간에 끼어들 수 있음
- TTS는 즉시 멈춰야 함
- interruption은 새 입력으로 pipeline에 들어가야 함
- agent 자신의 TTS 음성이 다시 입력으로 잡히면 안 됨

잘못 설계되면 다음이 생긴다.

- caller 위에 agent가 계속 말함
- pause를 발화 종료로 잘못 판단
- backchannel과 실제 interrupt를 구분하지 못함
- 과도한 dead air

## 5. Jangoing에 적용하면 무엇이 달라지나

현재 Jangoing은 text-first pipeline이다.

```text
user text
-> parser / future model
-> confirmation
-> event storage
-> inventory projection
```

voice를 붙이면 앞단과 뒷단에 음성층이 추가된다.

```text
user speech
-> audio capture
-> streaming ASR
-> Jangoing NLU / policy / inventory lookup
-> confirmation / action planning
-> TTS response
```

핵심은 **inventory reasoning pipeline은 유지하고, voice layer를 그 위에 올리는 것**이다.

## 6. Jangoing에서 ASR가 특히 어려운 이유

일반 ASR가 약해지는 지점이 Jangoing에서는 중요한 slot이 되는 경우가 많다.

- item names
- brand names
- quantities
- units
- dates
- code-switching
- household-specific terms

예:

- `oat milk` vs `whole milk`
- `carton` vs phonetically similar words
- `Coke Zero`, `LaCroix`, `gochujang`
- `next Friday`

즉 Jangoing voice 품질은 ASR의 word error rate보다, **structured fields가 얼마나
안 깨지느냐**에 크게 좌우된다.

## 7. Jangoing에서 endpointing이 중요한 이유

Jangoing 사용자 발화는 매우 짧을 수도 있고, 자연어로 길게 풀어 말할 수도 있다.

예:

- `Add milk.`
- `We're out of milk.`
- `The yogurt expires next Friday.`
- `I think we're probably almost out of eggs, and the milk might go bad tomorrow.`

endpointing이 너무 빠르면 문장을 중간에 끊고, 너무 느리면 매 turn마다 응답이
굼떠진다. Jangoing은 `mark_low`, `mark_out`, `update_expiry`, `add_item` 같은
미세한 구분이 중요하므로 endpointing 오류가 downstream 오판으로 이어지기 쉽다.

## 8. Grounding이 특히 중요한 이유

Jangoing은 open-ended chatbot이 아니라 **현재 household state를 기준으로 행동해야
하는 system**이다.

예:

```text
Put it on the list.
```

이 발화는 단순 transcript만으로는 처리할 수 없다. 최소한 다음이 필요하다.

- 직전 대화 referent
- current inventory state
- existing shopping list
- prior user preference
- stored `reference_date` / `timezone`
- unresolved ambiguity state

즉 voice layer는 Jangoing의 grounding 구조와 강하게 연결되어야 한다.

## 9. Clarification과 multi-turn interaction

text에서도 clarification은 중요하지만, voice에서는 더 중요하다.

예:

```text
User: We have no milk.
Agent: Do you want me to mark milk as out of stock only, or also add it to the shopping list?
User: Add it too.
Agent: Done. Milk is marked out, and I added it to your shopping list.
```

이런 loop가 들어가는 순간 turn-taking, barge-in, context carry가 품질을 크게
좌우한다.

## 10. Raspberry Pi에서 가능한 것

Raspberry Pi는 voice client로 충분히 쓸 수 있다.

### Pi에서 잘 맞는 역할

- microphone input
- speaker output
- push-to-talk button
- wake word
- local audio playback
- short canned prompts
- optional lightweight local TTS

### Pi에서 부담이 큰 역할

- 고품질 low-latency neural TTS
- 복잡한 ASR
- heavy LLM inference
- long-context reasoning

따라서 초기는 **Pi는 입출력 장치, 클라우드는 이해와 주요 음성 생성** 역할로
나누는 것이 현실적이다.

## 11. Raspberry Pi 음성 출력 방식

### 방식 A: Cloud TTS -> Pi playback

흐름:

```text
Pi records user speech
-> server interprets
-> cloud TTS generates audio
-> Pi streams or downloads audio
-> Pi plays it
```

장점:

- 음질이 좋음
- 다국어와 prosody 품질이 높음
- 구현이 쉬움

단점:

- 네트워크 의존
- latency 증가 가능
- 오프라인 동작 어려움

### 방식 B: Local TTS on Pi

예:

- `espeak-ng`
- `piper`
- `flite`
- lightweight ONNX TTS

장점:

- 오프라인 가능
- fallback가 빠름
- privacy 측면에서 유리

단점:

- cloud TTS보다 음질이 떨어질 수 있음
- CPU, memory, tuning 제약이 큼

## 12. Jangoing에 권장하는 hybrid 구조

가장 현실적인 시작점은 hybrid다.

```text
Normal response:
Cloud TTS -> Pi playback

Fallback / ultra-short prompts:
Local audio or local TTS on Pi
```

예를 들어 아래는 Pi에 미리 둔 짧은 음성 또는 로컬 TTS로 처리할 수 있다.

- `Okay.`
- `I didn't catch that.`
- `Please repeat the item name.`
- `I'm checking your inventory.`
- `The connection is unstable.`

반면 긴 confirmation이나 explanation은 cloud TTS가 더 적합하다.

## 13. Jangoing voice MVP 권장 구조

### 단계 1: Text pipeline 유지

현재 text confirmation path를 그대로 유지한다.

### 단계 2: Voice adapter 추가

```text
audio in
-> ASR
-> same text interpretation pipeline
-> same confirmation policy
-> TTS / audio out
```

### 단계 3: Push-to-talk

초기에는 wake word보다 push-to-talk가 더 안정적이다.

이유:

- accidental activation 감소
- endpointing 단순화
- debugging 용이
- ASR/NLU 오류와 activation 오류를 분리 가능

### 단계 4: Clarification turns

voice로 clarification question과 answer를 주고받을 수 있게 한다.

### 단계 5: Barge-in and full duplex

그 이후에만 더 인간다운 turn-taking을 붙인다.

## 14. 신뢰성과 실패 설계

실서비스에서는 일부 컴포넌트 실패를 가정해야 한다.

예:

- ASR가 item name을 잘못 들음
- inventory lookup timeout
- TTS 느려짐
- cloud inference unavailable
- Pi network 끊김
- audio device error

권장 fallback:

- `I didn't catch the item name. Could you repeat it?`
- `I'm having trouble checking your inventory right now.`
- `Do you want to continue on your phone?`
- AI layer 실패 시 text/web handoff

즉 voice가 실패해도 기존 web product가 세션을 이어받을 수 있어야 한다.

## 15. 측정해야 하는 지표

### Voice interaction 지표

- ASR endpointing latency
- time to first transcript
- time to first audio
- end-to-end turn latency
- barge-in interruption latency
- ASR correction rate for item/unit/date fields
- clarification rate
- false interruption rate
- fallback frequency

### Jangoing-specific 지표

- voice vs text intent accuracy
- voice vs text slot accuracy
- expiry/date normalization accuracy under ASR noise
- confirmation completion rate
- successful inventory mutation rate
- handoff to web rate

## 16. 권장 구현 순서

1. text NLU / annotation / baseline model 안정화
2. confirmation and clarification policy 고정
3. Pi audio input/output shell 구현
4. cloud ASR + existing text pipeline 연결
5. cloud TTS + Pi playback 연결
6. short local fallback prompts 추가
7. push-to-talk productionize
8. multi-turn spoken clarification
9. wake word
10. barge-in and full duplex refinement

## 17. 단일 사용자 ASR 개인화

현재 제품은 한 명의 사용자를 우선 대상으로 하므로, 일반적인 다중 speaker ASR
training보다 다음 순서를 우선한다.

- push-to-talk와 고정 microphone으로 입력 분산 축소
- 현재 inventory와 shopping list로 request별 keyword 생성
- confirmation correction을 개인 ASR feedback pair로 저장
- item, quantity, unit, date 중심으로 slot 정확도 평가
- 반복되는 개인 발음 오류만 confusion layer로 교정
- 위 방식 이후에도 남는 acoustic error에만 fine-tuning 검토

provider 비교, personal frozen set, 동적 vocabulary, fine-tuning gate의 상세 설계는
[단일 사용자용 Personalized ASR 전략](./PERSONALIZED_ASR_STRATEGY.md)을
따른다.

## 18. 최종 결론

Jangoing에서 voice를 붙인다는 것은 단순히 STT와 TTS를 붙이는 것이 아니다.

핵심은 다음이다.

- ASR accuracy for inventory fields
- endpointing
- clarification turn-taking
- grounded inventory state usage
- confirmation safety
- latency budget management
- fallback design

한 줄로 요약하면:

```text
Voice for Jangoing is not just speech I/O.
It is a real-time grounded interaction layer on top of the existing inventory reasoning pipeline.
```
