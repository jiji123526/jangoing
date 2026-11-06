import {
  InterpretationSchema,
  LocationSchema,
  type CommandSlots,
  type Interpretation,
} from "@jangoing/contracts";
import {
  normalizeExpiryDate,
  type TemporalGroundingContext,
} from "./temporal-grounding";
import {
  StageTraceSchema,
  type StageTrace,
} from "./pipeline-contracts";
import type {
  RawNluAction,
  RawNluResult,
  RawSlots,
} from "./nlu-contracts";

const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const unitAliases: Record<string, string> = {
  bags: "bag",
  bottles: "bottle",
  cans: "can",
  cartons: "carton",
  dozens: "dozen",
  jars: "jar",
  packs: "pack",
  pieces: "piece",
};

const itemAliases: Record<string, string> = {
  eggs: "egg",
  yogurts: "yogurt",
};

export const normalizerVersion = "normalizers-v2";

export interface NormalizationResult {
  interpretation: Interpretation;
  trace: StageTrace;
}

function cleanItem(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[?.!,]+$/g, "")
    .replace(/^(?:any|some|the)\s+/i, "")
    .replace(/\s+please$/i, "")
    .trim();

  return itemAliases[cleaned] ?? cleaned;
}

function parseQuantity(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  const parsed = numberWords[normalized] ?? Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedUnit(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return unitAliases[normalized] ?? normalized;
}

function normalizeSlots(
  rawSlots: RawSlots,
  intent: Interpretation["intent"],
  temporalContext: TemporalGroundingContext,
): CommandSlots {
  const slots: CommandSlots = {};

  if (rawSlots.item_name) {
    slots.item_name = cleanItem(rawSlots.item_name);
  }

  const quantity = parseQuantity(rawSlots.quantity);
  if (quantity !== undefined) {
    slots.quantity = quantity;
  }

  const lowThreshold = parseQuantity(rawSlots.low_threshold);
  if (lowThreshold !== undefined) {
    slots.low_threshold = lowThreshold;
  }

  const unit = normalizedUnit(rawSlots.unit);
  if (unit) {
    slots.unit = unit;
  }

  if (rawSlots.location) {
    slots.location = LocationSchema.parse(
      rawSlots.location.trim().toLowerCase(),
    );
  } else if (intent === "add_item") {
    slots.location = "fridge";
  }

  const expirationDate = normalizeExpiryDate(
    rawSlots.expiration_date,
    temporalContext,
  );
  if (expirationDate) {
    slots.expiration_date = expirationDate;
  }

  return slots;
}

function normalizeAction(
  action: RawNluAction,
  temporalContext: TemporalGroundingContext,
) {
  return {
    intent: action.intent,
    slots: normalizeSlots(action.slots, action.intent, temporalContext),
  };
}

export function normalizeNluResult(
  nlu: RawNluResult,
  temporalContext: TemporalGroundingContext,
): NormalizationResult {
  const startedAt = Date.now();
  const slots = normalizeSlots(nlu.slots, nlu.intent, temporalContext);
  const actions = nlu.actions?.map((action) =>
    normalizeAction(action, temporalContext)
  );
  const interpretation = InterpretationSchema.parse({
    intent: nlu.intent,
    slots,
    ...(actions && actions.length > 1 ? { actions } : {}),
    confidence: nlu.confidence,
    requires_confirmation:
      nlu.intent === "throw_away" ||
      nlu.intent === "mark_out" ||
      nlu.intent === "set_low_threshold" ||
      nlu.confidence < 0.85,
    raw_utterance: nlu.raw_utterance,
  });
  const trace = StageTraceSchema.parse({
    stage: "normalization",
    status: "completed",
    version: normalizerVersion,
    latency_ms: Date.now() - startedAt,
    confidence: nlu.confidence,
    reason_code: "rules_normalization_baseline",
  });

  return { interpretation, trace };
}
