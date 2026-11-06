import { z } from "zod";
import { IntentSchema } from "@jangoing/contracts";

export const RawEntityTypeSchema = z.enum([
  "ITEM",
  "QUANTITY",
  "UNIT",
  "LOCATION",
  "EXPIRY_DATE",
]);

export const RawEntitySpanSchema = z
  .object({
    type: RawEntityTypeSchema,
    text: z.string().trim().min(1).max(120),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict()
  .superRefine((entity, context) => {
    if (entity.end <= entity.start) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "Entity end must be greater than start",
      });
    }
  });

export const RawSlotsSchema = z
  .object({
    item_name: z.string().trim().min(1).max(120).optional(),
    quantity: z.string().trim().min(1).max(40).optional(),
    low_threshold: z.string().trim().min(1).max(40).optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    location: z.string().trim().min(1).max(40).optional(),
    expiration_date: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const RawNluActionSchema = z
  .object({
    intent: IntentSchema,
    slots: RawSlotsSchema,
    entities: z.array(RawEntitySpanSchema).max(8),
  })
  .strict();

export const RawNluResultSchema = z
  .object({
    raw_utterance: z.string().max(2000),
    intent: IntentSchema,
    slots: RawSlotsSchema,
    entities: z.array(RawEntitySpanSchema).max(8),
    actions: z.array(RawNluActionSchema).min(1).max(8).optional(),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()
  .superRefine((result, context) => {
    const validateSpan = (
      entity: z.infer<typeof RawEntitySpanSchema>,
      path: (string | number)[],
    ) => {
      if (entity.end > result.raw_utterance.length) {
        context.addIssue({
          code: "custom",
          path: [...path, "end"],
          message: "Entity end must stay within the raw utterance",
        });
      }

      if (result.raw_utterance.slice(entity.start, entity.end) !== entity.text) {
        context.addIssue({
          code: "custom",
          path: [...path, "text"],
          message: "Entity text must match its raw utterance span",
        });
      }
    };

    result.entities.forEach((entity, index) => {
      validateSpan(entity, ["entities", index]);
    });
    result.actions?.forEach((action, actionIndex) => {
      action.entities.forEach((entity, entityIndex) => {
        validateSpan(entity, ["actions", actionIndex, "entities", entityIndex]);
      });
    });
  });

export type RawEntitySpan = z.infer<typeof RawEntitySpanSchema>;
export type RawSlots = z.infer<typeof RawSlotsSchema>;
export type RawNluAction = z.infer<typeof RawNluActionSchema>;
export type RawNluResult = z.infer<typeof RawNluResultSchema>;
