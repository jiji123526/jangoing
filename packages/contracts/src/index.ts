import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const IsoDateSchema = z.string().regex(
  isoDatePattern,
  "Expected a date in YYYY-MM-DD format",
);

export const IntentSchema = z.enum([
  "add_item",
  "update_expiry",
  "consume_item",
  "mark_low",
  "mark_out",
  "throw_away",
  "add_to_buy",
  "query_inventory",
  "needs_clarification",
  "unknown",
]);

export const LocationSchema = z.enum(["fridge", "freezer", "pantry"]);

export const SpeakerRoleSchema = z.enum(["user", "assistant", "system"]);

export const ActivationModeSchema = z.enum([
  "manual_text",
  "push_to_talk",
  "wake_word",
  "always_listening",
]);

export const CommandSlotsSchema = z
  .object({
    item_name: z.string().min(1).optional(),
    quantity: z.number().positive().optional(),
    unit: z.string().min(1).optional(),
    location: LocationSchema.optional(),
    expiration_date: IsoDateSchema.optional(),
  })
  .strict();

export const InterpretCommandRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    expiration_date: IsoDateSchema.optional(),
    reference_date: IsoDateSchema.optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    conversation_id: z.string().uuid().optional(),
    turn_index: z.number().int().nonnegative().optional(),
    speaker_role: SpeakerRoleSchema.optional(),
    activation_mode: ActivationModeSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.turn_index !== undefined && request.conversation_id === undefined) {
      context.addIssue({
        code: "custom",
        path: ["conversation_id"],
        message: "conversation_id is required when turn_index is provided",
      });
    }
  });

export const InterpretationSchema = z
  .object({
    intent: IntentSchema,
    slots: CommandSlotsSchema,
    confidence: z.number().min(0).max(1),
    requires_confirmation: z.boolean(),
    raw_utterance: z.string(),
  })
  .strict();

export const LoggedInterpretationSchema = InterpretationSchema.extend({
  inference_id: z.string().uuid(),
  parser_version: z.string(),
  latency_ms: z.number().nonnegative(),
});

export const InferenceOutcomeSchema = z.enum([
  "pending",
  "confirmed",
  "corrected",
  "cancelled",
  "rejected",
  "annotated",
]);

export const EntityLabelSchema = z.enum([
  "ITEM",
  "ITEM_CONDITION",
  "CATEGORY",
  "QUANTITY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
]);

// Controlled values used by annotation-v2. Keep these aligned with
// ml/taxonomy/grocery-v1.json and the command contract.
export const AnnotationNormalizedValues = {
  ITEM: [
    "milk",
    "egg",
    "yogurt",
    "oat_milk",
    "cheese",
    "butter",
    "apple",
    "banana",
    "grape",
    "strawberry",
    "tomato",
    "spinach",
    "lettuce",
    "bread",
    "rice",
    "pasta",
    "cereal",
    "oatmeal",
    "chicken",
    "tofu",
    "salmon",
    "water",
    "juice",
    "orange_juice",
    "coffee",
    "tea",
    "sparkling_water",
    "soda",
    "chips",
    "crackers",
    "cookies",
    "ice_cream",
    "peanut_butter",
    "blueberry",
    "frozen_blueberry",
  ],
  ITEM_CONDITION: [
    "ripe",
    "unripe",
    "overripe",
    "fresh",
    "stale",
    "expired",
    "spoiled",
    "rotten",
    "moldy",
    "frozen",
    "thawed",
    "bruised",
  ],
  CATEGORY: [
    "beverage",
    "snack",
    "produce",
    "breakfast",
    "dairy",
    "sweet",
    "healthy_food",
    "greens",
    "protein",
    "staple",
  ],
  QUANTITY: [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24],
  UNIT: [
    "piece",
    "bottle",
    "carton",
    "bag",
    "box",
    "can",
    "jar",
    "pack",
    "gram",
    "kilogram",
    "ounce",
    "pound",
    "milliliter",
    "liter",
    "cup",
  ],
  LOCATION: ["fridge", "freezer", "pantry"],
  EXPIRY_DATE: [],
} as const satisfies Record<EntityLabel, readonly (string | number)[]>;

export const AnnotationPhraseFamilies = {
  add_item: [
    "explicit_add_to_inventory",
    "purchased_item_report",
    "storage_instruction",
    "quantity_addition",
  ],
  update_expiry: [
    "explicit_set_expiry",
    "expiry_metadata_report",
    "expiry_metadata_correction",
  ],
  consume_item: [
    "consumed_item_report",
    "used_item_report",
    "finished_item_report",
    "quantity_consumed",
  ],
  mark_low: [
    "state_low_on_entity",
    "state_almost_out",
    "need_more_soon",
    "quantity_running_low",
  ],
  mark_out: [
    "state_out_of_entity",
  ],
  throw_away: [
    "explicit_discard_request",
    "spoiled_item_discard",
    "thrown_away_report",
    "expired_item_discard",
  ],
  add_to_buy: [
    "explicit_add_to_list",
    "purchase_request",
    "need_to_buy",
    "shopping_reminder",
  ],
  query_inventory: [
    "yes_no_inventory_query",
    "quantity_inventory_query",
    "location_inventory_query",
    "expiry_inventory_query",
  ],
  needs_clarification: [
    "unresolved_reference",
    "vague_category_request",
    "usual_items_request",
    "ambiguous_action",
  ],
  unknown: [
    "preference_statement",
    "unrelated_question",
    "unrelated_statement",
    "unsupported_request",
  ],
} as const satisfies Record<Intent, readonly string[]>;

export const EntityAnnotationSchema = z
  .object({
    label: EntityLabelSchema,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    text: z.string().min(1),
    normalized_value: z.union([z.string(), z.number()]).optional(),
  })
  .refine((entity) => entity.end > entity.start, "Entity end must follow start")
  .superRefine((entity, context) => {
    const requiresNormalizedValue = entity.label !== "QUANTITY";
    if (requiresNormalizedValue && entity.normalized_value === undefined) {
      context.addIssue({
        code: "custom",
        path: ["normalized_value"],
        message: `Normalized value is required for label ${entity.label}`,
      });
      return;
    }

    if (entity.label === "EXPIRY_DATE" && typeof entity.normalized_value !== "string") {
      context.addIssue({
        code: "custom",
        path: ["normalized_value"],
        message: "EXPIRY_DATE normalized value must be an ISO date string",
      });
      return;
    }

    if (
      entity.label === "EXPIRY_DATE" &&
      typeof entity.normalized_value === "string" &&
      !IsoDateSchema.safeParse(entity.normalized_value).success
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_value"],
        message: "EXPIRY_DATE normalized value must be in YYYY-MM-DD format",
      });
      return;
    }

    if (
      entity.label !== "EXPIRY_DATE" &&
      entity.label !== "QUANTITY" &&
      entity.normalized_value !== undefined &&
      (typeof entity.normalized_value !== "string" || entity.normalized_value.trim().length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["normalized_value"],
        message: `Normalized value for label ${entity.label} must be a non-empty string`,
      });
    }
  });

export const DatasetPurposeSchema = z.enum([
  "train_candidate",
  "evaluation_candidate",
]);

export const RelevanceSchema = z.enum([
  "actionable",
  "contextual_preference",
  "domain_non_actionable",
  "unrelated",
]);

export const AnnotationStatsSchema = z.object({
  annotated: z.number().int().nonnegative(),
  train_candidates: z.number().int().nonnegative(),
  evaluation_candidates: z.number().int().nonnegative(),
});

export const AnnotationActionSchema = z
  .object({
    intent: IntentSchema,
    entities: z.array(EntityAnnotationSchema),
    phrase_family: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .superRefine((action, context) => {
    if (!action.phrase_family) return;
    const allowedFamilies: readonly string[] = AnnotationPhraseFamilies[action.intent];
    if (!allowedFamilies.includes(action.phrase_family)) {
      context.addIssue({
        code: "custom",
        path: ["phrase_family"],
        message: `Phrase family is not valid for intent ${action.intent}`,
      });
    }
  });

export const CreateAnnotationRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
    relevance: RelevanceSchema.optional(),
    actions: z.array(AnnotationActionSchema).max(8),
    dataset_purpose: DatasetPurposeSchema,
    notes: z.string().trim().max(1000).nullable().optional(),
    annotator: z.string().trim().min(1).max(80).default("web-anonymous"),
    assistant_proposal_id: z.string().uuid().optional(),
    assistant_resolution: z
      .enum(["accepted_as_is", "accepted_with_edits"])
      .optional(),
  })
  .strict()
  .superRefine((annotation, context) => {
    const relevance = annotation.relevance ?? "actionable";
    if (relevance === "actionable" && annotation.actions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Actionable annotations require at least one action",
      });
    }

    if (relevance !== "actionable" && annotation.actions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: `Relevance ${relevance} must not include inventory actions`,
      });
    }

    if (annotation.assistant_proposal_id && !annotation.assistant_resolution) {
      context.addIssue({
        code: "custom",
        path: ["assistant_resolution"],
        message: "assistant_resolution is required when assistant_proposal_id is set",
      });
    }

    if (!annotation.assistant_proposal_id && annotation.assistant_resolution) {
      context.addIssue({
        code: "custom",
        path: ["assistant_proposal_id"],
        message: "assistant_proposal_id is required when assistant_resolution is set",
      });
    }
  });

export const AnnotationQueueTypeSchema = z.enum([
  "correction",
  "expiry",
  "low_confidence",
  "confirmed_unannotated",
  "evaluation_holdout",
  "generated_review",
  "preference_context",
  "domain_non_actionable",
  "unrelated_negative",
]);

export const AnnotationQueueItemSchema = z.object({
  inference_id: z.string().uuid(),
  text: z.string(),
  queue_type: AnnotationQueueTypeSchema,
  queue_reason: z.string(),
  suggested_relevance: RelevanceSchema.optional(),
  predicted_interpretation: InterpretationSchema,
  reviewed_interpretation: InterpretationSchema.optional(),
  outcome: InferenceOutcomeSchema,
  parser_version: z.string(),
  created_at: z.string(),
  temporal_context: z.object({
    reference_date: IsoDateSchema,
    timezone: z.string().trim().min(1).max(100),
    inference_created_at: z.string(),
    normalized_expiry_suggestion: IsoDateSchema.optional(),
  }),
});

export const AnnotationQueueQuerySchema = z.object({
  type: AnnotationQueueTypeSchema.default("correction"),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const AnnotationQueueResponseSchema = z.object({
  items: z.array(AnnotationQueueItemSchema),
});

export const AnnotationNormalizedValuesResponseSchema = z.object({
  ITEM: z.array(z.string().trim().min(1)),
  ITEM_CONDITION: z.array(z.string().trim().min(1)),
  CATEGORY: z.array(z.string().trim().min(1)),
  QUANTITY: z.array(z.number()),
  UNIT: z.array(z.string().trim().min(1)),
  LOCATION: z.array(z.string().trim().min(1)),
  EXPIRY_DATE: z.array(IsoDateSchema),
});

export const AnnotationAssistantProposalRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
  })
  .strict();

export const AnnotationAssistantProposalSchema = z.object({
  proposal_id: z.string().uuid(),
  inference_id: z.string().uuid(),
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  prompt_version: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).nullable().optional(),
  actions: z.array(AnnotationActionSchema).min(1).max(8),
  created_at: z.string(),
});

export const UpdateInferenceOutcomeRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
    outcome: InferenceOutcomeSchema.exclude(["pending"]),
    reviewed_interpretation: InterpretationSchema.optional(),
  })
  .strict();

export const EventTypeSchema = z.enum([
  "item_added",
  "item_consumed",
  "item_marked_low",
  "item_marked_out",
  "item_thrown_away",
  "item_added_to_buy",
]);

export const CreateEventRequestSchema = z
  .object({
    event_type: EventTypeSchema,
    item_name: z.string().trim().min(1).max(120),
    quantity: z.number().positive().nullable().optional(),
    unit: z.string().trim().min(1).max(40).nullable().optional(),
    location: LocationSchema.nullable().optional(),
    expiration_date: IsoDateSchema.nullable().optional(),
    raw_utterance: z.string().trim().min(1).max(500),
    confidence: z.number().min(0).max(1),
    source: z.enum(["web", "voice"]).default("web"),
  })
  .strict();

export const ConfirmActionRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
    event: CreateEventRequestSchema,
    original_interpretation: InterpretationSchema,
    parser_version: z.string().trim().min(1).max(80).default("rules-v1"),
  })
  .strict();

export const EventRecordSchema = CreateEventRequestSchema.extend({
  id: z.string(),
  created_at: z.string(),
});

export const ExpiryStateSchema = z.enum([
  "unknown",
  "fresh",
  "expiring_soon",
  "expired",
]);

export const InventoryStatusSchema = z.enum([
  "in_stock",
  "low",
  "out",
]);

export const InventoryItemSchema = z.object({
  item_name: z.string(),
  quantity: z.number().min(0),
  unit: z.string().nullable(),
  location: LocationSchema.nullable(),
  status: InventoryStatusSchema,
  nearest_expiration_date: IsoDateSchema.nullable(),
  expiry_state: ExpiryStateSchema,
});

export const ShoppingListItemSchema = z.object({
  item_name: z.string(),
  added_at: z.string(),
});

export type Intent = z.infer<typeof IntentSchema>;
export type SpeakerRole = z.infer<typeof SpeakerRoleSchema>;
export type ActivationMode = z.infer<typeof ActivationModeSchema>;
export type CommandSlots = z.infer<typeof CommandSlotsSchema>;
export type InterpretCommandRequest = z.infer<
  typeof InterpretCommandRequestSchema
>;
export type Interpretation = z.infer<typeof InterpretationSchema>;
export type LoggedInterpretation = z.infer<typeof LoggedInterpretationSchema>;
export type InferenceOutcome = z.infer<typeof InferenceOutcomeSchema>;
export type EntityLabel = z.infer<typeof EntityLabelSchema>;
export type EntityAnnotation = z.infer<typeof EntityAnnotationSchema>;
export type AnnotationAction = z.infer<typeof AnnotationActionSchema>;
export type DatasetPurpose = z.infer<typeof DatasetPurposeSchema>;
export type Relevance = z.infer<typeof RelevanceSchema>;
export type AnnotationStats = z.infer<typeof AnnotationStatsSchema>;
export type CreateAnnotationRequest = z.infer<typeof CreateAnnotationRequestSchema>;
export type AnnotationQueueType = z.infer<typeof AnnotationQueueTypeSchema>;
export type AnnotationQueueItem = z.infer<typeof AnnotationQueueItemSchema>;
export type AnnotationQueueQuery = z.infer<typeof AnnotationQueueQuerySchema>;
export type AnnotationQueueResponse = z.infer<typeof AnnotationQueueResponseSchema>;
export type AnnotationNormalizedValuesResponse = z.infer<
  typeof AnnotationNormalizedValuesResponseSchema
>;
export type AnnotationAssistantProposalRequest = z.infer<
  typeof AnnotationAssistantProposalRequestSchema
>;
export type AnnotationAssistantProposal = z.infer<
  typeof AnnotationAssistantProposalSchema
>;
export type UpdateInferenceOutcomeRequest = z.infer<
  typeof UpdateInferenceOutcomeRequestSchema
>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type ConfirmActionRequest = z.infer<typeof ConfirmActionRequestSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
