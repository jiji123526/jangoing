# 모델 평가 및 로깅 표준

## 목적

jangoing은 모델 학습과 검증을 프로젝트의 중심으로 본다. 제품 상호작용은 사용자를
돕는 동시에, 언어 및 추천 시스템이 어디서 좋아지거나 나빠지는지에 대한 reviewed,
versioned evidence를 만드는 역할도 한다.

## 로깅은 기본값이다

모든 해석 시도는 `unknown`, `cancelled`, `rejected`, `corrected` 요청을 포함해
항상 inference record를 만들어야 한다. 로깅은 inventory event 생성 여부에
의존해서는 안 된다.

최소 inference field:

- 익명화된 interaction, session, household 식별자
- timestamp, locale, timezone, input modality, turn index
- 현재 발화와 허용된 context snapshot 참조
- predicted intent, raw slot span, normalized slot, confidence
- parser/model, normalizer, prompt, schema, application version
- 해당될 경우 dataset version과 experiment/run identifier
- pipeline stage별 latency, fallback path, validation error
- user outcome: confirmed, corrected, cancelled, rejected, timed out
- corrected intent, span, normalized value, correction duration

민감한 대화 텍스트에는 명시적 retention policy가 필요하다. Training export는
pseudonymous identifier를 사용하고, 비밀값이나 관련 없는 개인정보는 제외해야 한다.

## 재현 가능한 실험

모든 training run은 다음을 기록한다.

- source commit과 dirty/clean 상태
- immutable dataset 및 split version
- split strategy와 leakage check
- model 및 tokenizer identifier
- hyperparameter, seed, hardware, duration, dependency lock hash
- checkpoint와 최종 artifact digest
- offline metric, slice metric, calibration plot, error sample

Production 모델은 frozen test set에서 현재 baseline을 이기고 safety 및 latency
gate를 통과한 뒤에만 바뀐다. 결과는 model registry나 experiment dashboard에서
비교해야 하며, terminal log에만 남아 있어서는 안 된다.

## 언어 모델 평가 지표

최소한 다음을 보고한다.

- intent macro-F1 및 intent별 precision/recall/F1
- entity-level slot precision/recall/F1
- field별 normalization accuracy
- end-to-end exact action match
- unknown detection AUROC/F1 및 false-accept rate
- expected calibration error 및 reliability curve
- correction rate, abandonment rate, median confirmation time
- p50/p95 end-to-end latency 및 stage latency
- multi-action exact match, per-action intent F1, action-to-entity assignment F1

결과는 항상 phrase family, input modality 또는 activation mode, speaker role,
utterance length, action count, multi-turn dependency, ambiguity, ASR noise,
unseen item, date expression, user goal 기준으로 slice를 나눠 본다. 하나의
aggregate score만으로는 충분하지 않다.

현재 TF-IDF baseline은 명시적으로 single-intent 전용이다. Export된 multi-action
record를 첫 intent로 축약하면 안 되며, multi-label 또는 structured prediction
baseline이 생기기 전까지는 제외하고 그 excluded count를 run metadata에 적는다.

## Dataset candidate 정책

- `synthetic-v1`은 training bootstrap과 pipeline 검증용이며, human evaluation
  set이 아니다.
- template, model output, error analysis의 영향을 받은 human example은
  training candidate다.
- 독립적으로 작성된 natural example은 evaluation candidate다.
- evaluation candidate는 duplicate 제거, phrase-family grouping, human review,
  version approval을 거친 뒤에야 validation 또는 frozen test data가 된다.
- 초기 수집 목표는 human training candidate 100–200개와 human evaluation
  candidate 100+개다. 개수는 quality나 coverage review를 대체하지 않는다.

## Context 평가

Context는 explicit하고 inspectable해야 한다. recent turn, confirmed household
state, preference, dietary constraint, goal, budget, location, time을 포함하며,
각 prediction은 어떤 context source를 썼는지 기록해야 한다.

Contextual test set은 다음을 측정해야 한다.

- non-command conversation 안에서 request detection
- turn 간 antecedent 및 entity resolution 정확도
- relevant-context retrieval precision/recall
- state consistency 및 contradiction handling
- 필요한 정보가 없을 때의 clarification quality
- stale, unrelated, unauthorized context에 대한 저항성

Contextual confidence가 높더라도 state-changing action은 계속 confirmation을
요구한다.

## Recommendation 평가

Recommendation은 learned ranking 전에 rule + retrieval부터 시작한다. Candidate는
inventory, expiry, shopping list, dietary goal, preference, 명시적으로 연결된 deal
source에서 올 수 있다.

Offline metric:

- Recall@K, NDCG@K, MAP@K, catalog coverage
- constraint satisfaction과 unsafe recommendation rate
- diversity, novelty, substitution quality, deal freshness
- explanation faithfulness: 인용한 입력이 실제 ranking에 영향을 주는가

Online metric:

- accept, save, add-to-list, purchase, dismiss, correction rate
- incremental savings와 expired-food reduction
- unhealthy engagement를 최적화하지 않는 goal adherence
- complaint 및 opt-out rate와 함께 보는 retention

Deal recommendation은 source, price, unit price, merchant, location,
observed/expiry timestamp를 포함해야 한다. 오래되었거나 검증할 수 없는 deal은
현재 사실처럼 보여 주지 않는다.

## 평가 게이트

어느 한 metric이 올랐다고 해서 모델이나 recommender를 승격시키지 않는다.
Release는 safety constraint를 보존하고, critical slice에서 material regression이
없고, latency limit을 만족하며, rollback target을 포함해야 한다. Production
outcome은 model version별로 모니터링해 development-over-development 변화가
계속 보이게 해야 한다.
