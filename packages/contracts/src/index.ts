import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const IsoDateSchema = z.string().regex(
  isoDatePattern,
  "Expected a date in YYYY-MM-DD format",
);

export const IntentSchema = z.enum([
  "add_item",
  "consume_item",
  "mark_low",
  "throw_away",
  "add_to_buy",
  "query_inventory",
  "needs_clarification",
  "unknown",
]);

export const LocationSchema = z.enum(["fridge", "freezer", "pantry"]);

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
  })
  .strict();

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
  "CATEGORY",
  "QUANTITY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
]);

// Controlled values used by annotation-v1. Keep these aligned with
// ml/taxonomy/grocery-v1.json and the command contract.
export const AnnotationNormalizedValues = {
  ITEM: [
    "milk",
    "egg",
    "yogurt",
    "apple",
    "banana",
    "bread",
    "rice",
    "water",
    "juice",
    "coffee",
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
    "state_out_of_entity",
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
  .refine((entity) => entity.end > entity.start, "Entity end must follow start");

export const DatasetPurposeSchema = z.enum([
  "train_candidate",
  "evaluation_candidate",
]);

export const CreateAnnotationRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
    intent: IntentSchema,
    entities: z.array(EntityAnnotationSchema),
    dataset_purpose: DatasetPurposeSchema,
    phrase_family: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    annotator: z.string().trim().min(1).max(80).default("web-anonymous"),
  })
  .strict()
  .superRefine((annotation, context) => {
    if (!annotation.phrase_family) return;
    const allowedFamilies: readonly string[] = AnnotationPhraseFamilies[annotation.intent];
    if (!allowedFamilies.includes(annotation.phrase_family)) {
      context.addIssue({
        code: "custom",
        path: ["phrase_family"],
        message: `Phrase family is not valid for intent ${annotation.intent}`,
      });
    }
  });

export const AnnotationQueueItemSchema = z.object({
  inference_id: z.string().uuid(),
  text: z.string(),
  predicted_interpretation: InterpretationSchema,
  parser_version: z.string(),
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
export type CommandSlots = z.infer<typeof CommandSlotsSchema>;
export type InterpretCommandRequest = z.infer<
  typeof InterpretCommandRequestSchema
>;
export type Interpretation = z.infer<typeof InterpretationSchema>;
export type LoggedInterpretation = z.infer<typeof LoggedInterpretationSchema>;
export type InferenceOutcome = z.infer<typeof InferenceOutcomeSchema>;
export type EntityLabel = z.infer<typeof EntityLabelSchema>;
export type EntityAnnotation = z.infer<typeof EntityAnnotationSchema>;
export type DatasetPurpose = z.infer<typeof DatasetPurposeSchema>;
export type CreateAnnotationRequest = z.infer<typeof CreateAnnotationRequestSchema>;
export type AnnotationQueueItem = z.infer<typeof AnnotationQueueItemSchema>;
export type UpdateInferenceOutcomeRequest = z.infer<
  typeof UpdateInferenceOutcomeRequestSchema
>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type ConfirmActionRequest = z.infer<typeof ConfirmActionRequestSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
