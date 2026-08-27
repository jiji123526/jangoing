import {
  IsoDateSchema,
  LocationSchema,
  type CommandSlots,
  type Intent,
  type Interpretation,
} from "@jangoing/contracts";

export const generatedReviewSourcePrefix = "generated-review:";
export const generatedReviewParserVersion = "generated-review-import-v1";
export const generatedReviewNormalizerVersion = "normalizers-v1";
export const generatedReviewSchemaVersion = "inference-v1";
export const generatedReviewReferenceDate = "2026-09-01";
export const generatedReviewTimezone = "America/Los_Angeles";

export interface GeneratedDatasetRecord {
  id?: string;
  text: string;
  intent: Intent;
  normalized?: Record<string, unknown>;
  generator_version?: string;
  locale?: string;
  difficulty?: string;
  phrase_family?: string;
  source?: string;
}

export function isGeneratedReviewSource(source: string): boolean {
  return source.startsWith(generatedReviewSourcePrefix);
}

export function generatedReviewSource(label: string): string {
  return `${generatedReviewSourcePrefix}${label}`;
}

export function generatedReviewSlots(
  normalized: Record<string, unknown> | undefined,
): CommandSlots {
  const slots: CommandSlots = {};
  if (!normalized) {
    return slots;
  }

  if (typeof normalized.item_name === "string" && normalized.item_name.trim().length > 0) {
    slots.item_name = normalized.item_name.trim();
  }

  if (typeof normalized.quantity === "number" && normalized.quantity > 0) {
    slots.quantity = normalized.quantity;
  }

  if (typeof normalized.unit === "string" && normalized.unit.trim().length > 0) {
    slots.unit = normalized.unit.trim();
  }

  if (typeof normalized.location === "string") {
    const parsedLocation = LocationSchema.safeParse(normalized.location.trim());
    if (parsedLocation.success) {
      slots.location = parsedLocation.data;
    }
  }

  if (typeof normalized.expiration_date === "string") {
    const parsedDate = IsoDateSchema.safeParse(normalized.expiration_date.trim());
    if (parsedDate.success) {
      slots.expiration_date = parsedDate.data;
    }
  }

  return slots;
}

export function generatedReviewInterpretation(
  record: GeneratedDatasetRecord,
): Interpretation {
  return {
    intent: record.intent,
    slots: generatedReviewSlots(record.normalized),
    confidence: 1,
    requires_confirmation: false,
    raw_utterance: record.text,
  };
}
