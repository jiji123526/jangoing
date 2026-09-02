# Jangoing Documentation

The repository root `README.md` is the project entry point. Detailed plans,
operational guides, decisions, and learning references live in this directory.

The `KO/ENG` split is being migrated in phases. When a mirrored document has
not been created in this tree yet, links temporarily fall back to the legacy
root `docs/...` path or to the opposite-language counterpart. The development
progress log is intentionally kept as the English source log and is not part of
the translation scope.

## Recommended Reading Order

Do not read every document at the same depth on the first pass. Follow the
phases below and stop after Phase 2 if the immediate task is annotation.

### Phase 1: Understand the Project

1. [Repository README](../README.md) — Product purpose, architecture, major
   features, and quick-start commands.
2. [Academic goals and research approach](./decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)
   — Research questions, hypotheses, methodology, and reasons behind major
   technical choices.
3. [Product and model plan](./planning/PLAN.md) — Full roadmap from the text MVP
   through annotation, model training, recommendations, and voice.
4. [Implementation notes](./decisions/IMPLEMENTATION_NOTES.md) — What is
   implemented, what remains planned, and why the current architecture was selected.
5. [Progress log](../planning/PROGRESS.md) — Reverse-chronological development
   history; search this document when tracing when a behavior changed.
6. [Current action items](./planning/ACTION_ITEMS.md) — Immediate migrations,
   annotation gates, model work, and product-catalog tasks.
7. [Local and production setup](./operations/SETUP.md) — SQLite, D1, Worker,
   Vercel, dataset seed/export, and deployment commands.

### Phase 2: Perform Annotation

8. [Production annotation guide](../../docs/annotation/ANNOTATION_GUIDE_KO.md) — Queue
   purposes, annotation UI usage, and the end-to-end review workflow.
9. [Annotation conventions v4](../../docs/annotation/ANNOTATION_CONVENTIONS_KO.md) —
   Authoritative intent, phrase-family, entity-span, normalized-value, and
   ambiguity rules. Keep this open while annotating.
10. [Relevance candidate dataset](../../docs/annotation/RELEVANCE_CANDIDATES_V1_KO.md) —
    How actionable, contextual preference, domain non-actionable, and unrelated
    candidates were generated and should be reviewed.
11. [Conversation data collection](./decisions/CONVERSATION_DATA_COLLECTION_DECISION.md)
    — Collection design for relevance and multi-turn conversational context.
12. [Temporal grounding and expiry](./decisions/TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md)
    — How relative dates use reference dates, timezones, and stored inference
    context.
13. [Inventory status and low threshold](./decisions/INVENTORY_STATUS_AND_LOW_THRESHOLD.md)
    — Quantity-derived Low/Out behavior and explicit status semantics.

For the current annotation milestone, reading through this phase is sufficient.

### Phase 3: Build and Evaluate Models

14. [ML and NLP concepts](../../docs/ml/ML_NLP_CONCEPTS_KO.md) — Beginner-oriented
    explanation of intents, slots, splits, leakage, baselines, evaluation, and
    ASR.
15. [Text dataset design v1](../../docs/ml/TEXT_DATASET_DESIGN_V1_KO.md) — Current
    candidate inventory, task decomposition, reviewed-data targets, source
    policy, split rules, and implementation gaps for the English text baseline.
16. [Synthetic dataset design](../../docs/ml/SYNTHETIC_V1_KO.md) — Structure,
    generation, variation strategy, validation, and limitations of
    `synthetic-v1`.
17. [Open dataset research](../../docs/ml/OPEN_DATASETS_KO.md) — Candidate public
    datasets and which portions can be adopted safely.
18. [Open Food Facts and brand normalization strategy](../../docs/ml/OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md)
    — Planned `grocery-v2` catalog, brand/item/category relationships, and
    external catalog safeguards.
19. [Model evaluation standard](../../docs/ml/MODEL_EVALUATION.md) — Frozen splits,
    exact-match metrics, leakage checks, slices, and production gates.
20. [ML quick start](../../ml/README.md) — Commands for validating datasets,
    training baselines, and running evaluations.
21. [Alignment and verifier training](../../docs/ml/ALIGNMENT_AND_VERIFIER_TRAINING_KO.md)
    — Advanced notes on SFT, PPO, DPO, GRPO, and context-verifier boundaries.

### Phase 4: Review Future Extensions

22. [Questions for a language engineer](../../docs/planning/LANGUAGE_ENGINEER_QUESTIONS_KO.md)
    — External review questions for annotation, ontology, queue, and
    model-feeding decisions.
23. [Voice agent pipeline and Raspberry Pi plan](../../docs/planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI_KO.md)
    — ASR/NLU/TTS architecture, latency, reliability, and Raspberry Pi roles.
24. [Single-user personalized ASR strategy](../../docs/planning/PERSONALIZED_ASR_STRATEGY_KO.md)
    — Personal vocabulary, Korean-English code-switching, correction feedback,
    and fine-tuning gates.
25. [Item media and vision recognition plan](../../docs/planning/ITEM_MEDIA_AND_VISION_PLAN_KO.md)
    — Artwork-first item photos, storage, privacy, and eventual vision
    recognition.
26. [Apple Music UI kit design guide](../../docs/design/APPLE_MUSIC_UI_KIT_GUIDE_KO.md) —
    Screen structure, component dimensions, and visual rules for consumer
    pages.

## Reference Index

### Planning and Status

- [Product and model plan](./planning/PLAN.md)
- [Current action items](./planning/ACTION_ITEMS.md)
- [Progress log](../planning/PROGRESS.md)
- [Item media and vision recognition plan](../../docs/planning/ITEM_MEDIA_AND_VISION_PLAN_KO.md)
- [Questions for a language engineer](../../docs/planning/LANGUAGE_ENGINEER_QUESTIONS_KO.md)
- [Voice agent pipeline and Raspberry Pi plan](../../docs/planning/VOICE_AGENT_PIPELINE_AND_RASPBERRY_PI_KO.md)
- [Single-user personalized ASR strategy](../../docs/planning/PERSONALIZED_ASR_STRATEGY_KO.md)

### Annotation

- [Production annotation guide](../../docs/annotation/ANNOTATION_GUIDE_KO.md)
- [Annotation conventions v4](../../docs/annotation/ANNOTATION_CONVENTIONS_KO.md)
- [Relevance candidate dataset](../../docs/annotation/RELEVANCE_CANDIDATES_V1_KO.md)

### ML and Data

- [ML and NLP concepts](../../docs/ml/ML_NLP_CONCEPTS_KO.md)
- [Text dataset design v1](../../docs/ml/TEXT_DATASET_DESIGN_V1_KO.md)
- [SFT, PPO, DPO, GRPO and verifier training notes](../../docs/ml/ALIGNMENT_AND_VERIFIER_TRAINING_KO.md)
- [Model evaluation standard](../../docs/ml/MODEL_EVALUATION.md)
- [Synthetic dataset design](../../docs/ml/SYNTHETIC_V1_KO.md)
- [Open dataset research](../../docs/ml/OPEN_DATASETS_KO.md)
- [Open Food Facts and brand normalization strategy](../../docs/ml/OPEN_FOOD_FACTS_BRAND_STRATEGY_KO.md)

### Decisions

- [Academic goals and research approach](./decisions/ACADEMIC_GOALS_AND_RESEARCH_APPROACH.md)
- [Implementation notes](./decisions/IMPLEMENTATION_NOTES.md)
- [Conversation data collection](./decisions/CONVERSATION_DATA_COLLECTION_DECISION.md)
- [Temporal grounding and expiry](./decisions/TEMPORAL_GROUNDING_AND_EXPIRY_FIX.md)
- [Inventory status and low threshold](./decisions/INVENTORY_STATUS_AND_LOW_THRESHOLD.md)

### Operations

- [Local and production setup](./operations/SETUP.md)

### Design

- [Apple Music UI kit 기반 Jangoing 디자인 가이드](../../docs/design/APPLE_MUSIC_UI_KIT_GUIDE_KO.md)

Package-specific training commands remain in
[the ML quick start](../../ml/README.md).
