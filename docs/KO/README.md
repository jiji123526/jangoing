# Jangoing 문서

Repository root의 `README.md`는 프로젝트 진입점이다. 자세한 계획, 운영 가이드,
의사결정 기록, 학습 참고 문서는 이 디렉터리에 정리한다.

현재 `KO/ENG` 재구성은 단계적으로 진행 중이다. 아직 이 트리로 옮기지 않은 문서는
기존 root `docs/...` 경로 또는 반대 언어 문서로 연결된다. 진행 로그는 번역
대상에서 제외하고 영어 원문을 기준 로그로 유지한다.

## 권장 읽기 순서

처음부터 모든 문서를 같은 깊이로 읽을 필요는 없다. 아래 단계 순서로 읽고, 지금
목표가 annotation이라면 Phase 2까지만 읽어도 충분하다.

### Phase 1: 프로젝트 이해

1. [Repository README](../../README.md)
   제품 목적, 아키텍처, 주요 기능, 빠른 실행 명령
2. [Academic goals and research approach](./decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)
   학술 목표, 연구 질문, 방법론, 주요 기술 선택의 근거
3. [Product and model plan](./planning/PLAN.md)
   text MVP부터 annotation, 모델 학습, recommendation, voice까지의 전체 로드맵
4. [Implementation notes](./decisions/IMPLEMENTATION_NOTES.md)
   현재 구현된 것, 아직 계획만 있는 것, 현재 아키텍처를 택한 이유
5. [Progress log](../planning/PROGRESS.md)
   최신 변경이 위에 오는 개발 기록. 특정 동작이 언제 바뀌었는지 추적할 때 사용
6. [Current action items](./planning/ACTION_ITEMS.md)
   당장 남아 있는 migration, annotation gate, model 작업, product catalog 작업
7. [Local and production setup](./operations/SETUP.md)
   SQLite, D1, Worker, Vercel, dataset seed/export, 배포 명령

### Phase 2: Annotation 수행

8. [Production annotation guide](./annotation/ANNOTATION_GUIDE.md)
   queue 목적, annotation UI 사용법, end-to-end review workflow
9. [Annotation conventions v4](./annotation/ANNOTATION_CONVENTIONS.md)
   authoritative intent, phrase family, entity span, normalized value,
   ambiguity rule. Annotation 중 계속 열어 두는 기준 문서
10. [Relevance candidate dataset](./annotation/RELEVANCE_CANDIDATES_V1.md)
    actionable, contextual preference, domain non-actionable, unrelated
    candidate를 어떻게 만들고 검수해야 하는지 설명
11. [Conversation data collection](./decisions/CONVERSATION_DATA_COLLECTION_DECISION.md)
    relevance와 multi-turn conversational context를 위한 수집 설계
12. [Temporal grounding and expiry](./decisions/TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md)
    relative date가 reference date, timezone, 저장된 inference context를 어떻게
    쓰는지 설명
13. [Inventory status and low threshold](./decisions/INVENTORY_STATUS_AND_LOW_THRESHOLD.md)
    quantity 기반 Low/Out 동작과 explicit status 의미 정의

현재 annotation milestone에서는 여기까지 읽으면 충분하다.

### Phase 3: 모델 구축과 평가

14. [ML and NLP concepts](./ml/ML_NLP_CONCEPTS.md)
    intent, slot, split, leakage, baseline, evaluation, ASR에 대한 입문 설명
15. [Text dataset design v1](./ml/TEXT_DATASET_DESIGN_V1.md)
    현재 candidate inventory, task 분해, reviewed-data 목표, source policy,
    split rule, English text baseline용 구현 gap
16. [Synthetic dataset design](./ml/SYNTHETIC_V1.md)
    `synthetic-v1`의 구조, 생성 방식, variation 전략, validation, 한계
17. [Open dataset research](./ml/OPEN_DATASETS.md)
    검토 가능한 public dataset과 안전하게 도입할 수 있는 범위
18. [Open Food Facts and brand normalization strategy](./ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md)
    `grocery-v2` catalog, brand/item/category relation, external catalog
    safeguard 계획
19. [Model evaluation standard](./ml/MODEL_EVALUATION.md)
    frozen split, exact-match metric, leakage check, slice, production gate
20. [ML quick start](../../ml/README.md)
    dataset 검증, baseline 학습, 평가 실행 명령
21. [Alignment and verifier training](./ml/ALIGNMENT_AND_VERIFIER_TRAINING.md)
    SFT, PPO, DPO, GRPO, context verifier 한계에 대한 고급 노트

### Phase 4: 이후 확장 검토

22. [Questions for a language engineer](./planning/LANGUAGE_ENGINEER_QUESTIONS.md)
    annotation, ontology, queue, model feeding 결정에 대해 외부 리뷰를 요청할 질문
23. [Voice agent pipeline and Raspberry Pi plan](./planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md)
    ASR/NLU/TTS 아키텍처, latency, reliability, Raspberry Pi 역할
24. [Single-user personalized ASR strategy](./planning/PERSONALIZED_ASR_STRATEGY.md)
    personal vocabulary, Korean-English code-switching, correction feedback,
    fine-tuning gate
25. [Item media and vision recognition plan](./planning/ITEM_MEDIA_AND_VISION_PLAN.md)
    artwork-first item photo, storage, privacy, eventual vision recognition 계획
26. [Apple Music UI kit design guide](../design/APPLE_MUSIC_UI_KIT_GUIDE_KO.md)
    consumer page용 screen structure, component dimension, visual rule

## 참조 인덱스

### Planning and Status

- [Product and model plan](./planning/PLAN.md)
- [Current action items](./planning/ACTION_ITEMS.md)
- [Progress log](../planning/PROGRESS.md)
- [Item media and vision recognition plan](./planning/ITEM_MEDIA_AND_VISION_PLAN.md)
- [Questions for a language engineer](./planning/LANGUAGE_ENGINEER_QUESTIONS.md)
- [Voice agent pipeline and Raspberry Pi plan](./planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI.md)
- [Single-user personalized ASR strategy](./planning/PERSONALIZED_ASR_STRATEGY.md)

### Annotation

- [Production annotation guide](./annotation/ANNOTATION_GUIDE.md)
- [Annotation conventions v4](./annotation/ANNOTATION_CONVENTIONS.md)
- [Relevance candidate dataset](./annotation/RELEVANCE_CANDIDATES_V1.md)

### ML and Data

- [ML and NLP concepts](./ml/ML_NLP_CONCEPTS.md)
- [Text dataset design v1](./ml/TEXT_DATASET_DESIGN_V1.md)
- [SFT, PPO, DPO, GRPO and verifier training notes](./ml/ALIGNMENT_AND_VERIFIER_TRAINING.md)
- [Model evaluation standard](./ml/MODEL_EVALUATION.md)
- [Synthetic dataset design](./ml/SYNTHETIC_V1.md)
- [Open dataset research](./ml/OPEN_DATASETS.md)
- [Open Food Facts and brand normalization strategy](./ml/OPEN_FOOD_FACTS_BRAND_STRATEGY.md)

### Decisions

- [Academic goals and research approach](./decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)
- [Implementation notes](./decisions/IMPLEMENTATION_NOTES.md)
- [Conversation data collection](./decisions/CONVERSATION_DATA_COLLECTION_DECISION.md)
- [Temporal grounding and expiry](./decisions/TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md)
- [Inventory status and low threshold](./decisions/INVENTORY_STATUS_AND_LOW_THRESHOLD.md)

### Operations

- [Local and production setup](./operations/SETUP.md)

### Design

- [Apple Music UI kit 기반 Jangoing 디자인 가이드](../design/APPLE_MUSIC_UI_KIT_GUIDE_KO.md)

Machine learning 실행 명령은 [ML quick start](../../ml/README.md)에 있다.
