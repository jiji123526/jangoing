# 학술 목표와 연구 접근

## 목적

이 문서는 Jangoing을 단순한 제품 구현이 아니라 연구 프로젝트로 정의한다. 학술적
목표, 연구 질문, 방법론, 주요 설계 선택, 기각하거나 미룬 대안, 그리고 그 선택의
이유를 기록한다.

제품 로드맵은 [PLAN.md](../planning/PLAN.md)에서 관리한다. Annotation 규칙은
[ANNOTATION_CONVENTIONS.md](../annotation/ANNOTATION_CONVENTIONS.md)에서
관리한다.

## 학술적 목표

Jangoing은 자연스러운 household utterance를 grounded하고, review 가능하며,
시간적으로 일관된 food-management action으로 어떻게 변환할 수 있는지 연구한다.

핵심 목표는 다음과 같다.

> typed input과 spoken Korean-English interaction 환경에서, 자원 제약 아래서도
> temporal grounding, provenance, interpretability, safe user control,
> efficient single-user adaptation을 유지하면서 conversational utterance를
> structured household food state change로 매핑하는 human-in-the-loop situated
> language understanding system을 설계하고 평가한다.

연구 대상은 단순한 intent classifier가 아니다. 연구 대상은 다음이 결합된 전체
시스템이다.

```text
conversational relevance detection
+ semantic parsing
+ entity normalization
+ temporal grounding
+ household state tracking
+ interactive correction
+ personalized speech and language adaptation
+ Korean-English code-switch resolution
+ household-scoped taxonomy feedback
+ resource-constrained inference
```

적용 도메인은 의도적으로 충분히 좁게 잡아 precise state tracking과 evaluation이
가능하도록 하되, 동시에 어려운 language phenomenon이 드러날 만큼은 넓게 잡는다.

- indirect request와 implicit state report
- action이 없는 domain language
- multi-action utterance
- generic item reference와 product-specific item reference
- relative date와 delayed annotation
- preference와 conversational context
- unseen food item과 surface form
- ASR-like noise
- speaker-specific pronunciation과 반복되는 ASR confusion
- 한 utterance 안팎에서 발생하는 Korean-English code-switching
- household-specific alias, brand, category preference
- edge-device latency와 memory constraint

## 연구 질문

### RQ1: 자연 대화에서의 relevance

시스템은 actionable food-management language와 preference, grocery-domain
non-action, unrelated conversation을 얼마나 정확하게 구분할 수 있는가?

중요한 비교는 단순히 actionable 대 unrelated만이 아니다. Domain
non-actionable utterance는 hard negative다.

```text
We need milk.                    -> actionable
I prefer oat milk.              -> contextual_preference
Milk is expensive these days.   -> domain_non_actionable
The train was late.             -> unrelated
```

### RQ2: 데이터 출처의 효과성

Deterministic synthetic data, AI-assisted draft, naturally occurring reviewed
utterance를 어떻게 조합해야 generalization을 가장 잘 확보할 수 있는가?

이 프로젝트는 synthetic data가 rare class coverage를 개선하면서도 template
similarity 때문에 evaluation을 부풀리지 않는지 측정한다.

### RQ3: 모듈형 hybrid 대 end-to-end modeling

모듈형 pipeline이 end-to-end model보다 accuracy, interpretability, safety,
maintenance 측면에서 더 나은 trade-off를 제공하는가?

초기 pipeline은 다음처럼 분리된다.

```text
relevance
-> intent
-> entity spans
-> deterministic normalization
-> schema validation
-> confirmation
```

후속 실험에서는 같은 frozen evaluation set 위에서 shared-encoder, multi-task,
structured end-to-end model과 비교할 수 있다.

### RQ4: Temporal grounding

원래 utterance의 temporal context를 명시적으로 보존하는 것이 expiry
normalization과 temporal consistency를 얼마나 개선하는가?

핵심 temporal hypothesis는 다음과 같다.

```text
relative expression meaning
= original reference_date
+ original timezone
```

Annotation 시각이나 assistant processing 시각은 원래 utterance context를
대체할 수 없다.

### RQ5: Annotation efficiency

Correction, low-confidence, expiry, relevance hard-negative, AI-assisted queue는
uniform random annotation보다 단위 human effort당 더 유용한 label을 만드는가?

유용한 evidence에는 다음이 포함된다.

- reviewed example당 model improvement
- correction time
- draft acceptance rate와 edit rate
- class coverage와 phrase-family coverage
- targeted evaluation slice에서의 error reduction

### RQ6: Edge deployment trade-off

Compact language-understanding pipeline을 Raspberry Pi나 다른
resource-constrained runtime에 배포할 때 accuracy, latency, memory, energy
trade-off는 어떻게 나타나는가?

비교 후보는 다음과 같다.

- TF-IDF 대 DistilBERT 계열 모델
- FP32 대 quantized ONNX
- local inference 대 remote inference
- model-only 대 hybrid model-and-rule execution

### RQ7: 효율적인 single-user personalization

Speaker-specific model fine-tuning이 필요해지기 전에 runtime adaptation만으로도
한 사용자의 ASR 및 language-understanding accuracy를 얼마나 개선할 수 있는가?

핵심 비교는 다음과 같다.

```text
general pretrained model
-> fixed language/device profile
-> dynamic household vocabulary
-> personal confusion correction
-> correction-derived supervised adaptation
-> optional acoustic or NLU fine-tuning
```

가설은 dynamic vocabulary, household state, reviewed correction이 즉각적인
speaker-specific fine-tuning보다 더 적은 data와 compute cost로 초기
item/brand/slot 개선의 대부분을 만들어낼 것이라는 점이다. Fine-tuning은 context나
taxonomy의 부재를 대신하는 수단이 아니라, 반복적으로 남는 residual error를 겨냥해야
한다.

이 프로젝트는 personalization을 generalization의 반대 개념으로 보지 않는다.
시스템은 reusable shared base와 detachable personal adapter를 분리한다.

```text
shared base
  action ontology, temporal rules, safety policy, general ASR/NLU

personal adapter
  household vocabulary, aliases, confusion history, category preferences,
  user/device calibration
```

현재 연구는 within-user improvement를 타당하게 측정할 수 있다. 이후 multi-user
study에서는 첫 사용자의 adapter 자체가 general하다고 주장하지 않으면서도, 같은
adaptation protocol이 적은 data로 새로운 사용자에게 이전될 수 있는지를 물을 수
있다.

### RQ8: Korean-English code-switching

한 화자가 한국어와 영어를 오갈 때 mixed-language pipeline은 entity identity,
action meaning, temporal expression을 보존할 수 있는가?

대표 예시는 다음과 같다.

```text
Coke Zero 다 떨어졌어.
우유 두 개 add 해줘.
Milk 유통기한을 next Friday로 update 해줘.
```

핵심 비교는 다음 세 가지다.

- 원래 mixed-language transcript를 보존하고 bilingual alias와 phrase family로
  해석하는 방식
- semantic parsing 전에 전체 transcript를 영어로 번역하는 방식
- separate monolingual pipeline을 사용하는 방식

작업 가설은 surface-preserving bilingual normalization이 translation-first
processing보다 brand spelling, entity span, correction provenance를 더 잘 보존할
것이라는 점이다.

### RQ9: Household feedback과 taxonomy adaptation

사용자가 제공하는 item category, alias, correction이 utterance-level linguistic
ground truth나 universal catalog truth로 오해되지 않으면서 household taxonomy를
어떻게 개선해야 하는가?

프로젝트는 다음을 분리한다.

```text
utterance annotation
-> what was explicitly said and what it meant

inventory category override
-> how this household groups a known item

catalog relation evidence
-> a provenance-bearing proposal for item/category/brand relationships
```

이렇게 하면 즉각적인 household personalization은 가능하면서도, 반복된 evidence를
versioned global taxonomy로 승격하는 통제된 경로를 유지할 수 있다.

## 연구 범위

### 포함 범위

- 영어 household food-management language를 1차 baseline으로 사용
- 영어 baseline 이후 single-user Korean-English code-switching pilot
- utterance-level relevance
- intent와 multi-action representation
- entity span extraction
- canonical item, quantity, unit, location, date normalization
- 원래 interaction에 grounded된 temporal interpretation
- supervised evidence로서의 user correction
- dynamic household vocabulary와 personal ASR confusion evidence
- 원래 surface span을 보존하는 bilingual item/action/date alias
- catalog relation evidence로서의 household-scoped item-category override
- offline, slice, latency, eventual online evaluation
- Raspberry Pi feasibility

### 보류 범위

- Korean-English single-user pilot을 넘어서는 광범위한 multilingual transfer
- Korean-English code-switching에 대한 population-level claim
- 제약 없는 open-domain dialogue
- confirmation 없는 automatic execution
- image 및 barcode understanding
- 제한 없는 automatic ontology induction
- learned recommendation ranking
- expiry grounding을 넘어서는 retrospective semantic event time
- clinical 또는 safety-critical dietary advice

이 범위들은 controlled single-user personalization experiment가 광범위한
multilingual, multimodal, population-level generalization과 뒤섞이지 않도록
보류한다.

### Generalization strategy

이 프로젝트는 **personalized-first, generalizable-architecture** 전략을 따른다.

- 현재 제품과 pilot은 하나의 명시된 사용자, household, device를 최적화한다.
- Shared language representation, action schema, temporal rule, safety
  constraint는 user-independent하게 유지한다.
- Personal audio, alias, vocabulary weight, correction rule, household
  preference는 shared base와 분리해 유지한다.
- 폭넓은 generalization은 추가 사용자, device, user-level train/evaluation 분리를
  요구하는 후속 empirical question이다.

이 범위 설정은 지금 당장 방어 가능한 bounded claim을 가능하게 하면서도, 미래에
zero-shot과 few-shot adaptation을 연구할 수 있는 경로를 남긴다.

## 방법론적 접근

### 1. 데이터 수집 환경으로서의 instrumented product

배포된 application은 inference context, prediction, user outcome, correction,
annotation, parser/model version, timestamp를 기록한다. 따라서 product use는
version이 없는 예시가 아니라 traceable evidence를 생성한다.

연구 loop는 다음과 같다.

```text
interaction
-> versioned inference
-> review/correction
-> reviewed dataset
-> reproducible experiment
-> frozen evaluation
-> deployment decision
-> monitored production outcomes
```

### 2. 계층적 language decomposition

시스템은 먼저 utterance가 action parser로 들어가야 하는지를 판단한다. Actionable
language만 intent와 entity 분석을 받는다.

이 분해는 grocery vocabulary가 자동 action trigger처럼 작동하는 것을 막고,
relevance error와 semantic parsing error를 분리해서 분석할 수 있게 한다.

### 3. 명시적 semantic representation

각 actionable utterance는 하나 이상의 action을 포함할 수 있다. 각 action은 다음을
포함한다.

- intent
- phrase family
- exact entity span
- normalized value

Surface span과 normalized value는 별도로 평가한다. 이는 phrase는 맞게 잡았지만
canonicalization이 틀린 경우를 완전히 정답으로 계산하는 것을 방지한다.

### 4. Hybrid neural and deterministic processing

통계 모델은 language variation이 큰 작업을 담당한다.

- relevance classification
- intent classification
- entity span extraction

Deterministic code는 제약된 transformation을 담당한다.

- quantity conversion
- unit normalization
- date resolution
- schema validation
- event persistence

이 경계는 hallucinated calendar value를 줄이고 normalization failure를 재현 가능하게
만든다.

### 5. Progressive baselines

Model complexity는 이전 baseline이 측정 가능한 기준점을 만든 뒤에만 증가시킨다.

```text
rules
-> TF-IDF + logistic regression
-> DistilBERT sequence classification
-> DistilBERT token classification
-> optional multi-task or structured model
```

모든 모델은 promotion 전에 같은 approved frozen set에서 평가한다.

### 6. Source-aware dataset construction

Dataset record는 다음 중 어디서 왔는지 보존한다.

- real user interaction
- deterministic queue seed
- generated review corpus
- AI-assisted annotation draft

Generated label은 candidate일 뿐 ground truth가 아니다. Human-reviewed saved
annotation만 supervised label을 제공한다.

### 7. Group-aware evaluation

Exact duplicate detection만으로는 충분하지 않다. Template가 food name만 다른 구조일
수 있기 때문이다. 따라서 closely related structure가 train/evaluation 경계를 넘지
않도록 phrase family를 사용한다.

Evaluation은 generated source와 actual-user source 성능도 분리해 보고한다.

### 8. Fine-tuning 이전의 layered personalization

Personalization은 비용이 점점 커지는 intervention의 연쇄로 다룬다.

```text
device and language hints
-> dynamic vocabulary from current household state
-> personal alias/confusion rules
-> retrieval of reviewed corrections
-> parameter-efficient or full fine-tuning
```

각 단계는 frozen personal holdout에서 incremental improvement를 보여야 한다.
이렇게 해야 context adaptation과 acoustic/model-parameter adaptation을 구분할 수
있고, fine-tuning이 사실은 data-modeling error를 가리는 수단이 되는 것을 막을 수
있다.

구현 경계는 다음과 같다.

```text
SharedBase
  versioned ontology
  general relevance/intent/slot model
  temporal normalizer
  schema and safety validation

PersonalAdapter
  user and device profile
  dynamic household phrase set
  reviewed ASR confusion pairs
  household aliases and category overrides
  optional user-specific model parameters
```

Personal evidence가 shared parameter나 global taxonomy relation을 직접 갱신해서는
안 된다. 승격은 explicit하고 provenance를 보존하는 절차를 거쳐야 한다.

### 9. Surface-preserving bilingual processing

Mixed Korean-English transcript는 원래 텍스트와 character span을 그대로 유지한다.
번역은 auxiliary feature나 comparison baseline으로는 사용할 수 있지만 canonical
annotation record가 되어서는 안 된다.

```text
speech
-> mixed transcript
-> bilingual entity/action resolution
-> canonical structured action
```

이 설계는 ASR, code-switch interpretation, normalization, downstream action
error를 각각 따로 측정할 수 있게 한다.

### 10. Evidence-separated taxonomy learning

Linguistic annotation, product catalog, user grouping choice는 provenance가 있는
서로 다른 evidence source로 남긴다. Inventory UI에서 선택한 category는 곧바로
household display behavior에 영향을 줄 수 있지만, future `grocery-v2` catalog에는
automatic global taxonomy mutation이 아니라 relationship evidence로 들어간다.

## 주요 선택과 근거

| 선택 항목 | 결정 | 이유 |
|---|---|---|
| 초기 언어 | 영어 baseline 후 single-user Korean-English pilot | Controlled baseline을 유지하면서 code-switching을 추적되지 않은 production behavior가 아니라 측정 가능한 확장으로 만든다. |
| 초기 입력 modality | voice보다 text 우선 | NLU 오류를 ASR과 microphone 오류에서 분리한다. |
| Generalization 전략 | reusable shared base와 detachable personal adapter를 둔 personalized-first | 공통 semantic과 safety policy를 한 speaker에 묶지 않으면서 실제 사용자에게 측정 가능한 가치를 만든다. |
| Personalization 순서 | fine-tuning보다 runtime context와 correction layer 우선 | Dynamic vocabulary와 household state는 parameter update보다 더 저렴하고 되돌리기 쉽다. |
| Code-switch 표현 | mixed-language transcript를 보존하고 나중에 normalize | Translation-first는 entity span, brand spelling, ASR 오류 위치를 지워버릴 수 있다. |
| Interaction style | mandatory NLU trigger token 없이 자연 utterance 사용 | 모든 입력이 command라는 가정을 하지 않아 relevance-detection 문제를 유지한다. |
| Relevance label | 네 개 class 사용 | immediate action, useful preference/context, grocery-domain hard negative, unrelated language를 분리한다. |
| Action representation | utterance당 multiple action group 허용 | compound request를 첫 intent 하나로 붕괴시키지 않는다. |
| Entity representation | exact character span과 normalized value 동시 저장 | span 평가와 normalization 평가를 독립적으로 할 수 있다. |
| Product condition | identity-changing modifier는 ITEM에 남기고, temporary state wording은 보통 context로 처리 | `frozen_blueberries` 같은 product와 `spoiled` 같은 temporary state를 구분한다. |
| Canonical vocabulary | reviewed ITEM/CATEGORY/UNIT value를 annotation 중 확장 가능하게 둠 | 닫힌 grocery list는 실제 product를 다 덮지 못하므로, reviewed growth를 허용하되 human oversight를 유지한다. |
| Inventory category feedback | household scope에 즉시 반영하고 catalog relation evidence로도 남김 | 개인 grouping choice는 유용한 taxonomy evidence지만 utterance label이나 universal category fact는 아니다. |
| External product data | Open Food Facts를 curated catalog 및 entity-linking source로 사용 | Product row는 name, brand, category는 주지만 natural command label이나 household action intent는 주지 않는다. |
| Brand representation | MVP에서는 branded mention을 별도 BRAND가 아닌 full ITEM span으로 유지 | 현재 brand-level action이나 constraint가 독립적으로 없는데 별도 label 비용만 늘어난다. |
| Relative date | original `reference_date + timezone` 사용 | 나중에 annotation해도 원래 의미를 안정적으로 유지한다. |
| Date calculation | LLM 출력이 아니라 deterministic normalizer 사용 | Calendar 계산은 재현 가능하고 schema-valid해야 한다. |
| Annotation assistance | AI draft를 쓰되 human review를 의무화 | 라벨링 effort는 줄이되 model output을 ground truth로 취급하지 않는다. |
| Candidate selection | purpose-specific queue 사용 | targeted collection과 annotation-efficiency analysis를 지원한다. |
| Synthetic data | bootstrap training과 workflow validation 전용 | Synthetic template는 coverage는 늘리지만 자연 evaluation 분포를 대표하지 않는다. |
| Evaluation split | explicit train/evaluation purpose와 phrase-family leakage check 사용 | alias만 바꾼 template leakage를 막는다. |
| 첫 learned baseline | TF-IDF + logistic regression | 빠르고, 해석 가능하며, CPU 친화적이고, 건너뛰기 어렵다. |
| Transformer 후보 | DistilBERT-class fine-tuning | full BERT보다 적은 compute로 contextual representation을 제공한다. |
| Model training | scratch pretraining 대신 pretrained model fine-tuning | 현재 reviewed data 규모는 task adaptation에는 맞지만 language pretraining에는 적합하지 않다. |
| Personalized training | frozen personal set에서 runtime adaptation이 plateau한 뒤에만 fine-tuning | 한 speaker, device, phrase list, recording condition에 과적합되는 것을 막는다. |
| State mutation | explicit user confirmation 요구 | false positive action의 피해를 줄이고 correction evidence를 남긴다. |
| Production annotation DB | centralized Cloudflare D1 사용 | 여러 device에서 일관된 annotation과 하나의 reviewed source of truth를 지원한다. |
| Edge deployment | offline accuracy 확인 후 ONNX와 quantization 평가 | model architecture를 너무 일찍 고정하지 않고 deployment constraint를 측정한다. |

Wake-word와 conversation collection rationale은
[CONVERSATION_DATA_COLLECTION_DECISION.md](./CONVERSATION_DATA_COLLECTION_DECISION.md)에
정리되어 있다. Temporal decision은
[TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md](./TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md)에
정리되어 있다.

## 기각되었거나 보류된 대안

### 언어 모델을 scratch부터 학습하기

현재 규모에서는 기각한다. 이 dataset은 supervised fine-tuning에는 맞지만 일반 영어
pretraining에는 맞지 않는다. Pretrained encoder에서 시작하는 편이 과학적으로도,
계산적으로도 더 타당하다.

### LLM을 유일한 production parser로 사용하기

보류한다. 제약 없는 출력은 schema validity, latency, cost, reproducibility,
edge deployment를 더 어렵게 만든다. LLM assistance는 annotation proposal과 후속
비교 실험에는 여전히 유용하다.

### 모든 grocery 문장을 actionable로 취급하기

기각한다. 이렇게 하면 lexical shortcut이 생기고 unsafe false action이 늘어난다.
따라서 domain non-actionable example을 hard negative로 의도적으로 수집한다.

### Synthetic label을 evaluation truth로 사용하기

기각한다. Template-generated test는 natural-language generalization이 아니라
template recovery를 측정하게 된다.

### Relative date를 annotation 시점 기준으로 다시 해석하기

기각한다. 원래 utterance의 의미가 바뀌고 label이 재현 불가능해진다.

### 닫힌 normalized item vocabulary

기각한다. 실제 household product는 열려 있고 계속 변한다. 제한 없는 automatic
canonicalization도 기각한다. 새 value는 human-reviewed annotation을 거쳐야 한다.

### 즉시 end-to-end structured generation으로 가기

모듈형 baseline이 생기기 전까지는 보류한다. Component baseline이 없으면 end-to-end
결과에서 failure가 relevance, intent, span, normalization, state application 중
어디서 왔는지 알 수 없다.

### 즉시 speaker-specific ASR fine-tuning 하기

보류한다. 반복되는 item error는 acoustic model이 아니라 vocabulary 부재,
microphone condition, household context 때문일 수 있다. Dynamic keyword, 고정된
device condition, correction-based confusion analysis를 먼저 평가한다.
Fine-tuning은 repeatable acoustic error가 남고 별도 personal holdout이 있을 때만
정당화된다.

### Code-switched speech를 annotation 전에 번역하기

Canonical data path로는 기각한다. 번역은 brand를 바꾸고, 원래 entity span을
없애며, ambiguity를 너무 일찍 normalize하고, ASR error 위치를 추적 불가능하게
만들 수 있다. 번역은 comparison baseline으로는 유효하다.

### Category override를 CATEGORY annotation으로 취급하기

기각한다. 사용자가 `drinks`라는 단어를 말하지 않았어도 item을 `Drinks`로
grouping할 수 있기 때문이다. Override는 item-category relation evidence이지,
CATEGORY annotation은 실제 category mention이 있어야 한다.

## 실험 설계

### Dataset gate

현재 collection gate는 다음과 같다.

- workflow pilot: reviewed training 300개, evaluation candidate 100개
- first human-data baseline: training 1,000개, evaluation candidate 200개
- English MVP study: training 3,000-5,000개, evaluation 최소 500개

이 수치는 readiness threshold이지, sample size만으로 validity가 보장된다는 뜻은
아니다. Per-class, phrase-family, source, entity coverage는 여전히 필요하다.

초기 personalized speech pilot은 별도의 operational gate를 둔다.

- target user와 device에서 녹음한 utterance 약 150-250개
- provider 비교와 adaptation 비교를 위해 freeze한 utterance 최소 50-80개
- English-only, Korean-only, code-switched, item/brand, quantity, date,
  realistic noise coverage 포함
- 가능하면 recording session을 분리

이 범위는 experiment를 시작하기 위한 heuristic이지, acoustic fine-tuning에
충분하다는 뜻은 아니다. Fine-tuning readiness는 frozen personal set에서의 반복되는
residual error와 learning curve로 판단한다.

### Baseline comparison

계획된 baseline comparison은 다음과 같다.

1. deterministic rule
2. TF-IDF relevance 및 intent classifier
3. DistilBERT relevance 및 intent classifier
4. token-classification slot model
5. hybrid full pipeline
6. optional shared 또는 structured model

### Personalized speech 및 language comparison

Personalized study는 다음 단계의 ablation을 추가한다.

1. household context가 없는 general ASR
2. language/device hint
3. dynamic item 및 brand keyword
4. personal alias 및 confusion correction
5. correction-derived adaptation
6. optional fine-tuned multilingual checkpoint

모든 단계는 같은 frozen personal audio set에서 평가한다. Training recording과
evaluation recording은 utterance template 기준으로 분리해야 하고, 가능하면
recording session과 noise condition도 분리해야 한다.

### Generalization ladder

Claim과 experiment는 다음 단계로 확장된다.

1. **Within-user:** target user의 frozen holdout에서 adapter가 개선을 만드는가?
2. **Across sessions/devices:** 다른 recording session, noise condition,
   compatible microphone에서도 개선이 유지되는가?
3. **Zero-shot new user:** 다른 사용자의 adapter 없이 shared base만으로 얼마나
   작동하는가?
4. **Few-shot new user:** 유용한 새 adapter를 만들려면 reviewed data가 얼마나
   필요한가?
5. **Population-level:** 여러 사용자, accent, household, language habit에 걸쳐
   gain과 failure rate가 얼마나 안정적인가?

현재 single-user scope 안에 있는 것은 1번과 2번뿐이다. 3번부터 5번까지는 추가
participant와 user-disjoint evaluation이 필요하다.

### Code-switching comparison

Code-switch study는 다음 결과를 별도로 보고한다.

- English-only
- Korean-only
- 한국어 문법 안에 영어 item 또는 brand가 들어간 경우
- 영어 문법 안에 한국어 item이 들어간 경우
- 한 utterance 안에서 여러 번 switch하는 경우
- Korean counter, quantity, relative date

자연스러운 개인 usage distribution과 deliberately difficult diagnostic slice는
별도로 보고한다. Synthetic balance를 사용자의 자연 code-switch 분포처럼 제시해서는
안 된다.

### Taxonomy-feedback comparison

Inventory override evidence는 다음 관점으로 평가한다.

- household feedback 전후 automatic category accuracy
- correction rate와 repeated-override rate
- existing-category membership coverage
- `Other` 비율과 catalog-unknown 비율
- user override, reviewed language data, external catalog evidence 사이의
  agreement
- seen item 대 unseen item category resolution

### 핵심 metric

- relevance macro-F1 및 per-class F1
- intent macro-F1 및 per-intent precision/recall/F1
- entity exact-span precision/recall/F1
- entity type별 normalization accuracy
- end-to-end exact action match
- unknown false-accept rate
- calibration error
- correction rate와 abandonment rate
- p50/p95 latency와 memory
- multi-action exact match와 action/entity assignment accuracy
- item, brand, quantity, unit, date에 대한 ASR entity word error rate
- code-switch action 및 slot exact match
- personal correction 및 clarification rate
- 수집한 personal audio 분당 개선량
- household category override 및 taxonomy-proposal accuracy

### 필수 slice

- actual user 대 generated source
- seen item 대 unseen item
- direct request 대 indirect request
- phrase family
- relative date 대 absolute date
- single-action 대 multi-action
- short utterance 대 long utterance
- clean text 대 ASR-like noise
- typed input 대 spoken input
- English-only, Korean-only, code-switched speech
- code-switch 위치와 빈도
- baseline 대 dynamic vocabulary 대 personalized correction
- microphone distance, noise condition, recording session
- automatic category 대 user-overridden category
- household relation evidence 대 global catalog evidence
- activation mode
- context-dependent utterance 대 standalone utterance

Promotion requirement 전체는 [MODEL_EVALUATION.md](../ml/MODEL_EVALUATION.md)에
정리되어 있다.

## 타당성 위협

### Sampling bias

한 household, 한 annotator, 한 device는 broader population을 대표하지 않는다.
추가 participant와 environment가 생기기 전까지는 결과를 domain-specific하고
population-specific한 결과로 설명해야 한다.

Personalized study는 의도적으로 한 speaker에 최적화된다. 따라서 타당한 claim은
defined user/device/household configuration에서의 improvement이지,
speaker-independent ASR이나 bilingual population performance가 아니다.

### Annotation bias

한 annotator는 convention을 일관되게 적용할 수는 있지만 inter-annotator
agreement를 추정할 수는 없다. 더 강한 study를 위해서는 subset에 double-labeling을
적용하고 agreement와 adjudication을 보고해야 한다.

### Synthetic-template leakage

Generated utterance는 lexical surface는 달라도 구조는 같을 수 있다. Phrase-family
grouping과 source-specific reporting이 이 위험을 줄이지만 완전히 없애지는 못한다.

### Assistant anchoring

AI draft는 annotator를 suggested label 쪽으로 끌어당길 수 있다. 따라서 draft
acceptance, editing, no-draft control sample을 비교해야 한다.

### Temporal coverage

고정된 reference date와 단순 relative expression만으로는 calendar ambiguity 전체,
daylight-saving transition, locale variation, retrospective event time을 모두
포괄하지 못한다.

### Product-state validity

Semantic parse가 맞았다고 inventory projection이 사실상 맞는다는 뜻은 아니다.
User omission, duplicate report, household member의 행동 때문에 state drift가
생길 수 있다.

### Evaluation reuse

하나의 test set에 반복적으로 맞춰 model decision을 내리면 implicit test overfitting이
생긴다. Development validation set과 별도로 freeze된 final test set이 필요하다.

### Edge-device external validity

Laptop latency는 Raspberry Pi latency를 예측하지 못한다. 최종 claim에는 target
hardware에서의 측정이 필요하다.

### Personalization overfitting

모델이 한 speaker의 scripted command, microphone, phrase inventory를 외우기만 하고
실제 상호작용은 개선하지 못할 수 있다. Frozen utterance, recording session 분리,
noise slice, staged learning curve가 필요하다.

또한 personal adapter data는 shared-base evaluation과 격리되어야 한다. 그렇지 않으면
target user의 alias나 recording이 global model에 새어 들어가 일반적으로 더 좋아진
것처럼 보일 수 있다.

### Code-switch distribution validity

Generated mixed-language example은 switch frequency를 과장하거나 부자연스러운 switch
point를 만들 수 있다. 따라서 자연적으로 발생한 personal code-switch data와 synthetic
diagnostic case를 별도로 보고해야 한다.

### Taxonomy feedback circularity

User override가 taxonomy를 정의하고 같은 relation으로 그것을 평가하면 accuracy가
circular해진다. 평가에서는 item 또는 relation을 hold out하고, household preference
accuracy와 global catalog correctness를 구분해야 한다.

## 윤리, 프라이버시, 안전

- Raw household conversation은 sensitive information을 포함할 수 있으므로 retention
  및 deletion policy가 필요하다.
- Raw voice는 speaker-identifying biometric characteristic을 포함하므로 audio
  retention과 training consent는 명시적이어야 하고 독립적으로 철회 가능해야 한다.
- Training export는 secret과 관련 없는 personal content를 제외해야 한다.
- Source와 provenance는 불필요한 identity 노출 없이 유지해야 한다.
- State-changing action은 confirmation을 요구한다.
- Dietary나 allergy recommendation을 medical advice처럼 제시해서는 안 된다.
- Model error와 correction behavior는 aggregate accuracy 뒤에 숨기지 않고 보고할 수
  있어야 한다.

## 기대 기여

예상되는 학술 기여는 다음과 같다.

1. Relevance, action group, span, normalization, temporal context를 포함하는
   household food-state language용 reproducible하고 source-aware한 dataset 설계
2. Modular hybrid approach와 contextual neural approach의 empirical comparison
3. Targeted annotation과 AI-assisted annotation efficiency에 대한 evidence
4. Delayed annotation에도 의미가 안정적인 temporal-grounding protocol
5. Component metric을 실제 household action 및 correction outcome과 연결하는
   evaluation framework
6. Resource-constrained deployment에 대한 accuracy-latency-memory 분석
7. Reusable shared-base/personal-adapter architecture 위에서 runtime
   personalization과 speaker-specific fine-tuning을 비교하는 ablation study
8. Grounded household action을 위한 surface-preserving Korean-English
   code-switch annotation 및 evaluation protocol
9. Linguistic label을 오염시키지 않으면서 household category correction을 taxonomy
   relation evidence로 바꾸는 provenance-aware method

Claim은 data 규모에 비례해야 한다. Single-user personal project도 rigorous system과
pilot study를 만들 수는 있지만, broad population claim을 하려면 더 많은 participant,
annotator, device, household가 필요하다.

## 현재 상태와 남은 작업

구현 완료:

- production text interaction과 confirmation
- versioned inference 및 annotation logging
- four-class relevance annotation
- multi-action representation
- exact entity span과 normalized value
- deterministic temporal grounding
- source-aware generated review queue
- split leakage check
- TF-IDF single-intent baseline
- household-scoped production persistence를 포함한 inventory category override
- single-user ASR 및 Korean-English code-switching experiment design 문서화

미구현:

- dataset audit 및 near-duplicate report
- versioned `grocery-v2` catalog schema와 canonical migration rule
- curated Open Food Facts import와 exact-alias entity-linking baseline
- trainer의 frozen external-evaluation support
- relevance baseline training
- DistilBERT intent 및 relevance model
- token alignment와 slot-model training
- multi-action structured prediction
- calibration과 shadow deployment
- personal frozen audio collection과 ASR provider adapter
- dynamic bilingual ASR context-pack generation
- bilingual Korean-English action 및 entity normalization
- correction-derived personal ASR evidence storage
- runtime-personalization ablation과 optional fine-tuning experiment
- separate versioning이 가능한 shared-base/personal-adapter interface
- inventory override를 `grocery-v2` relation evidence로 변환하는 로직
- household-scoped new-category proposal workflow
- Raspberry Pi inference benchmark
- future user-disjoint zero-shot 및 few-shot adapter evaluation
- multi-annotator 및 multi-household validation

즉시 실행 항목은 [ACTION_ITEMS.md](../planning/ACTION_ITEMS.md)에 정리되어 있다.
외부 product catalog 결정과 구현 순서는
[OPEN_FOOD_FACTS_BRAND_STRATEGY.md](../ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md)에
정리되어 있다. 단계별 voice personalization 및 code-switching protocol은
[PERSONALIZED_ASR_STRATEGY.md](../planning/PERSONALIZED_ASR_STRATEGY.md)에
정리되어 있다.

## 참고 기반 문헌

- Devlin, J., Chang, M.-W., Lee, K., and Toutanova, K. (2019).
  [BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding](https://arxiv.org/abs/1810.04805).
- Sanh, V., Debut, L., Chaumond, J., and Wolf, T. (2019).
  [DistilBERT, a distilled version of BERT](https://arxiv.org/abs/1910.01108).
- Settles, B. (2009).
  [Active Learning Literature Survey](https://minds.wisconsin.edu/handle/1793/60660).
- Guo, C., Pleiss, G., Sun, Y., and Weinberger, K. Q. (2017).
  [On Calibration of Modern Neural Networks](https://arxiv.org/abs/1706.04599).
- Gebru, T. et al. (2021).
  [Datasheets for Datasets](https://arxiv.org/abs/1803.09010).
- Radford, A. et al. (2023).
  [Robust Speech Recognition via Large-Scale Weak Supervision](https://proceedings.mlr.press/v202/radford23a.html).
