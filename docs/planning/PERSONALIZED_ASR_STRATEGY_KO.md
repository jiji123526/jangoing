# 단일 사용자용 Personalized ASR 전략

## 목적

Jangoing의 음성 입력을 한 명의 사용자에게 맞추면서 다음 비용을 최소화한다.

- 직접 녹음하고 전사해야 하는 시간
- Raspberry Pi와 서버의 추론 비용
- 새 품목과 브랜드가 생길 때의 유지보수
- 잘못된 inventory mutation을 복구하는 비용

여기서 `customized ASR`는 처음부터 개인 음성 모델을 새로 학습한다는 뜻이 아니다.
단일 사용자에게는 **고정된 입력 환경, 동적 vocabulary biasing, 개인 오류 사전,
확인 결과를 이용한 feedback loop**를 먼저 결합하는 것이 더 효율적이다.

## 결론

첫 구현은 다음 구조가 적합하다.

```text
push-to-talk audio
-> audio normalization + VAD
-> cloud ASR with English hint and dynamic kitchen keywords
-> personal confusion correction + inventory-aware candidate resolution
-> existing Jangoing parser/model
-> editable confirmation
-> confirmed event
```

초기 ASR 후보는 request마다 `prompt`, `keywords`, `languages`를 전달할 수 있는
`gpt-transcribe`로 잡는다. 다만 공급자를 코드에 고정하지 않고, 같은 개인 평가
세트로 Google, Azure, 로컬 엔진을 교체 평가할 수 있는 adapter를 둔다.

Acoustic fine-tuning은 첫 단계가 아니다. vocabulary와 후처리를 적용한 뒤에도 같은
발음·억양 오류가 반복되고, 별도 holdout에서 개선 여부를 판단할 만큼 교정 음성이
쌓였을 때만 실험한다.

## 1. 한 명만 쓴다는 조건을 어떻게 활용하나

다중 사용자 서비스와 달리 다음 변수가 거의 고정된다.

- speaker와 accent
- 주로 사용하는 언어와 code-switching 습관
- Raspberry Pi의 microphone과 설치 위치
- 방의 반향과 주방 소음 종류
- 자주 쓰는 item, brand, unit, action 표현

따라서 일반 영어 전체의 WER를 낮추기보다 **이 사용자의 실제 장치에서 Jangoing
slot을 정확히 복원하는 것**에 최적화할 수 있다.

반대로 한 사람의 음성만으로 모델을 미세조정하면 특정 문장, 마이크 거리, 조용한
환경에 과적합되기 쉽다. 개인화와 평가 환경을 분리해야 한다.

## 2. 가장 효율이 높은 조치

### 2.1 Push-to-talk부터 사용

wake word와 continuous listening을 동시에 시작하지 않는다.

- 발화 시작점이 명확하다.
- 배경 대화를 ASR로 보내는 비용이 줄어든다.
- endpointing 오류와 activation 오류를 분리할 수 있다.
- 사용자가 버튼을 놓는 시점을 end-of-turn 신호로 활용할 수 있다.

VAD는 버튼 구간 안의 앞뒤 침묵과 긴 무음만 제거한다. 짧은 hesitation을 과도하게
잘라 문장을 둘로 나누지 않도록 개인 발화 속도로 조정한다.

### 2.2 언어와 입력 조건을 고정

현재 MVP는 English-first이므로 기본 요청에는 영어 language hint를 준다.
code-switching이 실제로 반복될 때만 허용 언어를 늘린다. 불필요한 자동 언어
감지는 짧은 명령에서 오판 가능성을 늘린다.

초기 하드웨어 실험은 같은 microphone, gain, 거리에서 수행한다. 서버로 보내는
형식도 mono PCM/WAV 같은 하나의 표준으로 정규화한다. sample rate 자체보다
clipping 방지, 일정한 gain, microphone 위치 고정이 우선이다.

### 2.3 한국어·영어 code-switching

한 명의 사용자만 대상으로 하면 한국어·영어 code-switching은 비교적 현실적이다.
언어 조합, accent, 자주 바꾸는 위치, 반복 vocabulary를 개인 profile로 제한할 수
있기 때문이다. 현재 OpenAI transcription API도 `languages`와 `keywords` hint를
함께 받을 수 있으므로 다음과 같은 request context를 만들 수 있다.

```json
{
  "languages": ["ko", "en"],
  "prompt": "A Korean and English kitchen inventory command. Preserve brand and product names in the language spoken.",
  "keywords": [
    "우유",
    "milk",
    "Coke Zero",
    "코크 제로",
    "냉장고",
    "fridge",
    "유통기한",
    "expiry date"
  ]
}
```

예상 난이도는 code-switching 종류에 따라 다르다.

| 유형 | 예 | 예상 난이도 |
| --- | --- | --- |
| 문장 간 전환 | `우유가 없어. Add it to the list.` | 낮음 |
| item/brand만 영어 | `Coke Zero 다 떨어졌어.` | 낮음-중간 |
| action만 영어 | `우유 두 개 add 해줘.` | 중간 |
| 한 문장 안에서 여러 번 전환 | `milk 유통기한을 next Friday로 update 해줘.` | 중간-높음 |
| 한 단어 내부 혼합·축약 | 개인만 쓰는 합성어 또는 불완전한 발음 | 높음 |

ASR가 성공해도 현재 English-first NLU가 한국어 action 표현을 이해하지 못할 수
있다. 따라서 code-switching 지원은 다음 두 층을 분리한다.

```text
multilingual ASR:
speech -> 원래 언어가 보존된 mixed transcript

bilingual normalization/NLU:
mixed transcript -> canonical item, action, quantity, date
```

전체 transcript를 영어로 먼저 번역하지 않는다. 번역하면 entity span, 실제 발음,
brand spelling, ASR 오류 위치를 잃을 수 있다. 대신 surface form을 보존한 채 alias와
phrase family를 canonical value에 연결한다.

```text
우유 / milk / 밀크                 -> milk
코크 제로 / Coke Zero             -> coke_zero
다 떨어졌어 / 없어 / out of       -> mark_out
목록에 넣어 / add to the list     -> add_to_buy
```

`밀크 -> milk` 같은 연결은 item normalization과 별도의 `speech_alias`로 관리하는
편이 안전하다. 사용자가 `milk`라고 넓게 말했을 때 `whole_milk`를 자동 선택하는
문제는 code-switching과 무관하게 기존 ambiguity policy를 따른다.

별도의 수동 언어 사전을 요구하지 않는다. 다음 자료에서 bilingual context pack을
자동 생성한다.

1. taxonomy의 canonical item과 한국어·영어 alias
2. 현재 inventory와 shopping list의 실제 item/brand
3. annotation에서 검수된 한국어·영어 entity surface
4. confirmation에서 사용자가 수정한 ASR transcript
5. 최근 사용 빈도가 높은 개인 phrase와 confusion pair

개인 평가 세트에는 언어별 결과를 섞어 하나의 평균만 내지 않는다.

- English-only
- Korean-only
- Korean sentence with English item/brand
- English sentence with Korean item
- multiple switches in one utterance
- Korean counter, quantity, relative date

각 slice의 entity, action, date exact match를 따로 측정한다. 실제 사용에서
code-switch가 드물다면 synthetic하게 절반을 혼합하지 않고, 개인 사용 비율과
hard-case 평가용 비율을 분리한다.

Fine-tuning 역시 첫 대응이 아니다. 한 사용자에게는 bilingual keywords, speech
alias, correction log가 더 싸고 즉시 갱신 가능하다. 동일한 code-switch acoustic
오류가 충분한 독립 발화에서 반복될 때만 multilingual checkpoint fine-tuning을
검토한다.

### 2.4 매 요청마다 작은 동적 vocabulary 생성

전체 식품 사전을 항상 넣지 않는다. 현재 상황에서 말할 가능성이 높은 값만
`ASR context pack`으로 만든다.

우선순위:

1. 현재 inventory와 shopping list에 있는 item 및 alias
2. 최근 추가·수정·검색한 item
3. 최근 ASR correction에서 틀린 surface form과 올바른 표기
4. household에서 실제 사용한 brand와 product variant
5. 현재 action에 필요한 unit, location, date 표현
6. taxonomy의 나머지 item은 낮은 우선순위 fallback

예:

```json
{
  "language": "en",
  "prompt": "A short kitchen inventory command about groceries, quantities, locations, and expiry dates.",
  "keywords": [
    "Coke Zero",
    "whole milk",
    "frozen blueberries",
    "saltine crackers",
    "two cartons",
    "expires next Friday"
  ]
}
```

목록 크기는 공급자 한도가 아니라 개인 evaluation으로 정한다. 너무 많은 단어를
강하게 bias하면 실제로 말하지 않은 품목이 나타나는 false positive가 증가할 수
있다. Google 문서도 높은 boost가 false negative를 줄이는 대신 false positive를
늘릴 수 있다고 명시한다.

### 2.5 ASR 뒤에 개인 confusion layer 추가

ASR 모델이 자주 만드는 오류를 모델 재학습 없이 교정한다.

```text
"coke cereal" -> "Coke Zero"
"two cardons" -> "two cartons"
```

단, 문자열을 전역 치환하지 않는다. 다음 조건을 함께 사용한다.

- 해당 후보가 현재 inventory, shopping list, alias catalog에 존재하는가
- 문장의 예상 entity 위치인가
- 다른 후보와 발음 또는 문자열 거리가 충분히 벌어지는가
- 교정 후 parser 결과가 유효한 action schema를 만드는가

후보가 둘 이상이면 자동 확정하지 않고 confirmation 또는 clarification으로 보낸다.
예를 들어 inventory에 `whole_milk`와 `oat_milk`가 모두 있는데 사용자가 `milk`라고
말하면 ASR 후처리가 임의로 하나를 선택해서는 안 된다.

### 2.6 기존 confirmation을 ASR annotation으로 재사용

사용자가 transcript나 structured action을 수정하면 별도의 annotation 화면 없이
다음 pair를 얻을 수 있다.

```text
audio
raw_asr_text
corrected_text
asr_context_pack
parsed_action_before_correction
confirmed_action
model/provider/version
microphone/device profile
created_at
```

효율을 위해 모든 성공 음성을 영구 저장하지 않는다.

- 수정된 음성은 우선 보존
- 낮은 confidence 또는 clarification 발생 음성은 우선 보존
- 성공 음성은 환경별 평가 표본만 보존
- 사용자가 원하면 raw audio를 삭제하고 transcript metadata만 유지

음성은 생체적 특성을 포함하므로 저장 동의, 접근 통제, retention 정책을 명시해야
한다. 이후 training에 쓰려면 수집 시점부터 그 목적을 사용자에게 알려야 한다.

## 3. 개인 평가 세트

일반 WER만으로는 Jangoing 품질을 판단할 수 없다. 다음 frozen personal test set을
먼저 만든다.

권장 시작 범위는 약 `150-250`개 발화이며, 이는 표준이나 보장 수치가 아니라 빠른
비교를 위한 프로젝트 운영 기준이다.

- 모든 action family의 짧은 명령
- item, brand, variant, unit, quantity
- absolute/relative expiry date
- `milk` 대 `whole milk`처럼 계층적으로 모호한 표현
- 개인이 자주 틀리게 인식되는 발음
- 조용한 환경, 냉장고/환풍기 소음, 다른 microphone 거리
- actionable과 domain non-actionable hard negative

이 중 일부는 provider와 parameter를 고르는 개발 세트로 쓰고, 최소 `50-80`개는
최종 holdout으로 고정한다. holdout 문장을 vocabulary tuning이나 confusion rule
작성에 직접 사용하지 않는다.

### 핵심 지표

- `WER`: 전체 transcript의 단어 오류
- `entity word error rate`: item, quantity, unit, date만 계산한 오류
- `slot exact match`: 모든 normalized slot이 맞는 비율
- `action exact match`: action과 핵심 slot 전체가 맞는 비율
- `unsafe auto-commit rate`: 잘못된 mutation이 확인 없이 실행된 비율
- `clarification rate`: 다시 물어봐야 했던 비율
- `correction rate`: 사용자가 transcript/action을 고친 비율
- `p50/p95 latency`: 버튼을 놓은 뒤 transcript와 confirmation까지 시간

모델 선택의 1순위는 WER가 아니라 `action exact match`와 안전성이다.

## 4. 효율적인 decoding policy

모든 요청에 가장 큰 모델을 쓰지 않는다.

```text
Pass 1:
fast ASR + dynamic context pack

If transcript resolves to one valid, high-confidence action:
show normal confirmation

If item/date/quantity is unresolved or ambiguous:
retry once with a stronger model or adjusted context

If still ambiguous:
ask a narrow clarification question
```

confidence 값은 provider마다 calibration이 다르므로 절대 임계값을 그대로 공유하지
않는다. personal development set에서 provider별 threshold를 정한다.

재시도 조건은 전체 문장 confidence보다 다음을 우선한다.

- item이 ontology와 연결되지 않음
- 날짜 parser가 값을 만들지 못함
- destructive action인데 item candidate가 둘 이상임
- ASR text와 projected state가 명백히 충돌함

## 5. 공급자와 로컬 엔진 선택

### 첫 cloud baseline: OpenAI `gpt-transcribe`

현재 공식 문서는 bounded audio의 기본 모델로 `gpt-transcribe`를 권장하며,
`prompt`, `keywords`, `languages`로 domain context를 전달할 수 있다고 설명한다.
Jangoing의 동적 inventory vocabulary를 요청마다 넣기 쉽다는 점이 장점이다.

이전 `whisper-1` prompting guide는 product name spelling을 prompt로 유도할 수
있지만 prompt가 완전히 신뢰할 수 있는 제약은 아니라고 설명한다. 따라서 prompt
출력은 항상 downstream validation과 confirmation을 통과해야 한다.

### 비교군: Google 또는 Azure

- Google Speech-to-Text adaptation은 phrase set, custom class, phrase별 boost를
  지원한다. item별 가중치를 세밀하게 실험할 때 유리하다.
- Azure phrase list는 runtime에 적용되고 별도 model training이 필요 없으며,
  list 전체 weight를 `0.0-2.0`으로 조절할 수 있다. 공식 문서는 phrase list를
  `500`개 이하로 유지하라고 안내한다.
- AWS Transcribe custom vocabulary는 brand, acronym, proper noun에 적합하고
  `Phrase`와 `DisplayAs`를 가진 table 형식을 제공한다. 다만 Jangoing의 매 요청
  inventory hot set보다는 비교적 안정적인 household vocabulary에 더 적합하다.

최종 선택은 마케팅 benchmark가 아니라 동일한 personal frozen set의 정확도,
latency, 가격으로 결정한다.

### 오프라인 후보: Vosk

Vosk small dynamic-graph model은 runtime vocabulary 변경을 지원하므로 매우 좁은
command grammar와 동적 item list에 적합하다. 자연스러운 긴 발화 품질은 반드시
개인 데이터로 cloud baseline과 비교해야 한다.

Vosk 문서는 acoustic fine-tuning이 가능하고 약 1시간 데이터 예시를 제시하지만,
Kaldi 형식과 training pipeline이 필요하다. 따라서 offline requirement가
명확하지 않은 초기 단계에는 비용 대비 우선순위가 낮다.

### Raspberry Pi 후보: whisper.cpp

whisper.cpp는 Raspberry Pi, microphone streaming, VAD를 지원한다. 로컬 privacy와
network fallback 실험에 적합하다. VAD로 비음성 구간을 제거하면 처리할 audio가
줄어들지만, Pi 모델 크기와 thread 수는 실제 장치에서 real-time factor와 slot
정확도를 함께 측정해 정해야 한다.

서버 CPU에서는 faster-whisper의 INT8과 Silero VAD도 비교할 수 있다. 공개
benchmark 수치를 Pi 성능으로 간주하지 말고 동일 장치에서 다시 측정한다.

## 6. Fine-tuning 진입 조건

다음이 모두 만족되기 전에는 fine-tuning하지 않는다.

- dynamic keywords와 personal confusion layer가 적용됨
- microphone과 audio preprocessing이 고정됨
- 반복 오류가 vocabulary 문제가 아니라 acoustic mismatch임을 확인함
- corrected audio/transcript가 충분히 쌓임
- 별도 personal holdout이 있음
- baseline 대비 slot/action exact match 개선을 검증할 수 있음

Vosk의 약 1시간 언급은 특정 adaptation 경로의 참고값이지 Jangoing 성공 보장이
아니다. Hugging Face의 Whisper 예시는 low-resource language에 8시간을 사용하며,
개인 영어 speaker adaptation의 최소량을 제시하는 자료가 아니다. 따라서 임의의
clip 수를 성공 기준으로 삼지 않고 learning curve로 결정한다.

```text
base model
-> + vocabulary/context
-> + personal correction layer
-> + 15 min train subset
-> + 30 min
-> + 60 min
```

각 단계에서 같은 frozen holdout을 평가한다. 개선이 멈추거나 일반 문장이
악화되면 fine-tuning 대신 runtime adaptation을 유지한다.

## 7. 구현 단계

### Phase 0: 개인 benchmark

1. 고정 microphone profile 정의
2. `150-250`개 script와 frozen split 작성
3. 원본 audio, reference transcript, expected action 저장
4. cloud ASR 2개 이상과 local 후보 1개 비교

### Phase 1: training 없는 개인화

1. `AsrProvider` adapter 정의
2. `ASR context pack` builder 구현
3. inventory, shopping list, taxonomy alias를 동적 keywords로 결합
4. push-to-talk audio를 cloud ASR에 전달
5. transcript를 기존 text pipeline과 confirmation으로 전달

### Phase 2: 자동 feedback loop

1. raw transcript와 corrected transcript 저장
2. personal confusion table 생성
3. corrected/ambiguous audio만 우선 보존
4. 주기적으로 frozen evaluation 실행
5. provider, prompt, keyword snapshot별 결과 비교

### Phase 3: Pi 최적화

1. VAD threshold와 silence duration 개인 조정
2. cloud primary와 local fallback 비교
3. whisper.cpp와 Vosk의 real-time factor 측정
4. network failure 시 local narrow-command fallback 제공

### Phase 4: 선택적 fine-tuning

반복 acoustic error가 충분히 확인된 경우에만 별도 experiment branch에서 수행한다.
production 교체는 holdout의 action/slot exact match와 latency가 모두 기준을
통과할 때만 한다.

## 8. 지금 Jangoing에서 선택할 구체적 경로

```text
1. Text MVP와 annotation을 계속 안정화
2. Pi가 없어도 laptop microphone으로 personal frozen audio set 생성
3. gpt-transcribe + English + dynamic keywords를 첫 baseline으로 측정
4. Google/Azure 중 하나를 weighted phrase baseline으로 비교
5. confirmation correction을 ASR feedback pair로 자동 저장
6. Pi 도입 후 같은 audio protocol과 provider adapter 재사용
7. local ASR와 fine-tuning은 측정 결과가 필요성을 보일 때만 추가
```

이 경로는 “한 명만 사용한다”는 장점을 vocabulary, 환경, correction loop에 먼저
사용한다. 가장 비싼 모델 학습은 마지막 선택지로 남긴다.

## 9. 참고 자료

2026-09-01에 확인한 공식 또는 프로젝트 문서:

- [OpenAI file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [OpenAI Whisper prompting guide](https://developers.openai.com/cookbook/examples/whisper_prompting_guide)
- [Google Cloud Speech-to-Text model adaptation](https://cloud.google.com/speech-to-text/docs/adaptation-model)
- [Azure phrase list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/improve-accuracy-phrase-list)
- [Amazon Transcribe custom vocabulary](https://docs.aws.amazon.com/transcribe/latest/dg/custom-vocabulary.html)
- [Vosk model adaptation](https://alphacephei.com/vosk/adaptation)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Hugging Face Whisper fine-tuning guide](https://huggingface.co/blog/fine-tune-whisper)
