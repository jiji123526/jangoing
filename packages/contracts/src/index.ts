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
]);

export const UpdateInferenceOutcomeRequestSchema = z
  .object({
    inference_id: z.string().uuid(),
    outcome: InferenceOutcomeSchema.exclude(["pending"]),
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
export type UpdateInferenceOutcomeRequest = z.infer<
  typeof UpdateInferenceOutcomeRequestSchema
>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type ConfirmActionRequest = z.infer<typeof ConfirmActionRequestSchema>;
export type EventRecord = z.infer<typeof EventRecordSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
