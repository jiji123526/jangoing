import type { AnnotationQueueType, CommandSlots, Interpretation } from "@jangoing/contracts";

export const annotationQueueSeedSource = "annotation-queue-seed-v1";
const parserVersion = "seeded-rules-v1";
const normalizerVersion = "seeded-normalizers-v1";
const schemaVersion = "inference-v1";
const baseReferenceDate = "2026-09-01";
const baseTimezone = "America/Los_Angeles";

type QueueSeedKind =
  | "correction"
  | "expiry"
  | "low_confidence"
  | "confirmed_unannotated"
  | "evaluation_holdout";

export interface QueueSeedPlan {
  correction: number;
  expiry: number;
  low_confidence: number;
  confirmed_unannotated: number;
  evaluation_holdout: number;
}

export interface SeededInferenceLogRecord {
  id: string;
  raw_utterance: string;
  request_context: string;
  predicted_interpretation: string;
  corrected_interpretation: string | null;
  parser_version: string;
  normalizer_version: string;
  schema_version: string;
  source: string;
  outcome: "pending" | "confirmed" | "corrected";
  latency_ms: number;
  created_at: string;
  resolved_at: string | null;
}

const correctionItems = [
  { text: "milk", normalized: "milk" },
  { text: "eggs", normalized: "egg" },
  { text: "yogurt", normalized: "yogurt" },
  { text: "spinach", normalized: "spinach" },
  { text: "strawberries", normalized: "strawberry" },
  { text: "orange juice", normalized: "orange_juice" },
  { text: "oat milk", normalized: "oat_milk" },
  { text: "broccoli", normalized: "broccoli" },
];

const expiryItems = [
  { text: "milk", normalized: "milk" },
  { text: "eggs", normalized: "egg" },
  { text: "yogurt", normalized: "yogurt" },
  { text: "orange juice", normalized: "orange_juice" },
  { text: "oat milk", normalized: "oat_milk" },
  { text: "spinach", normalized: "spinach" },
];

const confirmedItems = [
  { text: "milk", normalized: "milk" },
  { text: "eggs", normalized: "egg" },
  { text: "yogurt", normalized: "yogurt" },
  { text: "bread", normalized: "bread" },
  { text: "juice", normalized: "juice" },
  { text: "rice", normalized: "rice" },
  { text: "coffee", normalized: "coffee" },
];

const holdoutItems = [
  { text: "milk", normalized: "milk" },
  { text: "eggs", normalized: "egg" },
  { text: "yogurt", normalized: "yogurt" },
  { text: "apples", normalized: "apple" },
  { text: "juice", normalized: "juice" },
  { text: "bread", normalized: "bread" },
];

const lowConfidencePhrases = [
  "Put that on the list.",
  "Take care of the milk situation.",
  "We might need something for breakfast.",
  "Get the usual stuff.",
  "Handle the fridge situation.",
  "We are out of drinks.",
  "Figure out what we need for smoothies.",
  "Do something about the yogurt.",
];

const datePhrases = [
  { phrase: "tomorrow", iso: "2026-09-02" },
  { phrase: "next Friday", iso: "2026-09-04" },
  { phrase: "next Monday", iso: "2026-09-07" },
  { phrase: "September tenth", iso: "2026-09-10" },
  { phrase: "September twelfth", iso: "2026-09-12" },
  { phrase: "August twenty-eighth", iso: "2026-08-28" },
];

const locations: Array<CommandSlots["location"]> = ["fridge", "freezer", "pantry"];
const holdoutUuidLeads = ["0", "1", "2"] as const;

export function defaultQueueSeedPlan(): QueueSeedPlan {
  return {
    correction: 36,
    expiry: 48,
    low_confidence: 36,
    confirmed_unannotated: 42,
    evaluation_holdout: 24,
  };
}

function interpretation(
  rawUtterance: string,
  intent: Interpretation["intent"],
  slots: CommandSlots,
  confidence: number,
): Interpretation {
  return {
    intent,
    slots,
    confidence,
    requires_confirmation: intent === "throw_away" || confidence < 0.85,
    raw_utterance: rawUtterance,
  };
}

function isoTimestamp(index: number): string {
  return new Date(Date.UTC(2026, 8, 1, 8, index, 0)).toISOString();
}

function prefixedUuid(prefix: string, index: number): string {
  const value = index.toString(16).padStart(23, "0");
  return `${prefix}${value.slice(0, 7)}-${value.slice(7, 11)}-4000-8000-${value.slice(11, 23)}`;
}

function queuePrefix(type: QueueSeedKind): string {
  switch (type) {
    case "correction":
      return "a";
    case "expiry":
      return "b";
    case "low_confidence":
      return "c";
    case "confirmed_unannotated":
      return "d";
    case "evaluation_holdout":
      return "e";
  }
}

function seedRequestContext(queueType: QueueSeedKind): string {
  return JSON.stringify({
    expiration_date: null,
    reference_date: baseReferenceDate,
    timezone: baseTimezone,
    seed_queue_type: queueType,
  });
}

function makeRecord(
  queueType: QueueSeedKind,
  queueIndex: number,
  sequence: number,
  rawUtterance: string,
  predicted: Interpretation,
  options?: {
    corrected?: Interpretation;
    outcome?: "pending" | "confirmed" | "corrected";
    uuidLead?: string;
  },
): SeededInferenceLogRecord {
  const createdAt = isoTimestamp(sequence);
  const outcome = options?.outcome ?? "pending";
  const corrected = options?.corrected ?? (outcome === "confirmed" ? predicted : undefined);

  return {
    id: prefixedUuid(options?.uuidLead ?? queuePrefix(queueType), queueIndex),
    raw_utterance: rawUtterance,
    request_context: seedRequestContext(queueType),
    predicted_interpretation: JSON.stringify(predicted),
    corrected_interpretation: corrected ? JSON.stringify(corrected) : null,
    parser_version: parserVersion,
    normalizer_version: normalizerVersion,
    schema_version: schemaVersion,
    source: annotationQueueSeedSource,
    outcome,
    latency_ms: 12,
    created_at: createdAt,
    resolved_at: outcome === "pending" ? null : createdAt,
  };
}

function correctionRecord(index: number, sequence: number): SeededInferenceLogRecord {
  const item = correctionItems[index % correctionItems.length];
  const pattern = Math.floor(index / correctionItems.length) % 4;

  if (pattern === 0) {
    const text = `We're out of ${item.text}, add it to the shopping list.`;
    return makeRecord(
      "correction",
      index,
      sequence,
      text,
      interpretation(text, "needs_clarification", { item_name: item.normalized }, 0.54),
      {
        corrected: interpretation(text, "add_to_buy", { item_name: item.normalized }, 1),
        outcome: "corrected",
      },
    );
  }

  if (pattern === 1) {
    const text = `I tossed the ${item.text} because it went bad.`;
    return makeRecord(
      "correction",
      index,
      sequence,
      text,
      interpretation(text, "consume_item", { item_name: item.normalized }, 0.63),
      {
        corrected: interpretation(text, "throw_away", { item_name: item.normalized }, 1),
        outcome: "corrected",
      },
    );
  }

  if (pattern === 2) {
    const text = `We only have one ${item.text} left.`;
    return makeRecord(
      "correction",
      index,
      sequence,
      text,
      interpretation(text, "query_inventory", { item_name: item.normalized, quantity: 1 }, 0.48),
      {
        corrected: interpretation(text, "mark_low", { item_name: item.normalized, quantity: 1 }, 1),
        outcome: "corrected",
      },
    );
  }

  const location = locations[index % locations.length];
  const text = `Please put ${item.text} in the ${location} after you bring it home.`;
  return makeRecord(
    "correction",
    index,
    sequence,
    text,
    interpretation(text, "add_to_buy", { item_name: item.normalized }, 0.59),
    {
      corrected: interpretation(text, "add_item", { item_name: item.normalized, location }, 1),
      outcome: "corrected",
    },
  );
}

function expiryRecord(index: number, sequence: number): SeededInferenceLogRecord {
  const item = expiryItems[index % expiryItems.length];
  const date = datePhrases[index % datePhrases.length];
  const pattern = Math.floor(index / expiryItems.length) % 4;

  if (pattern === 0) {
    const text = `Add ${item.text} with expiry date on ${date.phrase}.`;
    return makeRecord(
      "expiry",
      index,
      sequence,
      text,
      interpretation(text, "add_item", { item_name: item.normalized, expiration_date: date.iso }, 0.95),
      {
        corrected: interpretation(text, "add_item", { item_name: item.normalized, expiration_date: date.iso }, 1),
        outcome: "confirmed",
      },
    );
  }

  if (pattern === 1) {
    const text = `The ${item.text} expires ${date.phrase}.`;
    return makeRecord(
      "expiry",
      index,
      sequence,
      text,
      interpretation(text, "unknown", {}, 0.24),
      {
        corrected: interpretation(text, "update_expiry", { item_name: item.normalized, expiration_date: date.iso }, 1),
        outcome: "corrected",
      },
    );
  }

  if (pattern === 2) {
    const text = `The ${item.text} is best by ${date.phrase}.`;
    return makeRecord(
      "expiry",
      index,
      sequence,
      text,
      interpretation(text, "needs_clarification", { item_name: item.normalized }, 0.4),
      {
        corrected: interpretation(text, "update_expiry", { item_name: item.normalized, expiration_date: date.iso }, 1),
        outcome: "corrected",
      },
    );
  }

  const text = `Keep the ${item.text}; it expires ${date.phrase}.`;
  return makeRecord(
    "expiry",
    index,
    sequence,
    text,
    interpretation(text, "unknown", {}, 0.31),
  );
}

function lowConfidenceRecord(index: number, sequence: number): SeededInferenceLogRecord {
  const text = lowConfidencePhrases[index % lowConfidencePhrases.length];
  const pattern = index % 4;

  if (pattern === 0) {
    return makeRecord(
      "low_confidence",
      index,
      sequence,
      text,
      interpretation(text, "needs_clarification", {}, 0.22),
    );
  }

  if (pattern === 1) {
    return makeRecord(
      "low_confidence",
      index,
      sequence,
      text,
      interpretation(text, "unknown", {}, 0.19),
    );
  }

  if (pattern === 2) {
    return makeRecord(
      "low_confidence",
      index,
      sequence,
      text,
      interpretation(text, "query_inventory", {}, 0.44),
    );
  }

  return makeRecord(
    "low_confidence",
    index,
    sequence,
    text,
    interpretation(text, "add_to_buy", {}, 0.51),
  );
}

function confirmedRecord(index: number, sequence: number): SeededInferenceLogRecord {
  const item = confirmedItems[index % confirmedItems.length];
  const pattern = Math.floor(index / confirmedItems.length) % 5;

  if (pattern === 0) {
    const text = `Buy ${item.text}.`;
    const parsed = interpretation(text, "add_to_buy", { item_name: item.normalized }, 0.97);
    return makeRecord("confirmed_unannotated", index, sequence, text, parsed, {
      corrected: parsed,
      outcome: "confirmed",
    });
  }

  if (pattern === 1) {
    const location = locations[index % locations.length];
    const text = `Add two cartons of ${item.text} to the ${location}.`;
    const parsed = interpretation(text, "add_item", {
      item_name: item.normalized,
      quantity: 2,
      unit: "carton",
      location,
    }, 0.96);
    return makeRecord("confirmed_unannotated", index, sequence, text, parsed, {
      corrected: parsed,
      outcome: "confirmed",
    });
  }

  if (pattern === 2) {
    const text = `We're low on ${item.text}.`;
    const parsed = interpretation(text, "mark_low", { item_name: item.normalized }, 0.95);
    return makeRecord("confirmed_unannotated", index, sequence, text, parsed, {
      corrected: parsed,
      outcome: "confirmed",
    });
  }

  if (pattern === 3) {
    const text = `Do we have ${item.text}?`;
    const parsed = interpretation(text, "query_inventory", { item_name: item.normalized }, 0.94);
    return makeRecord("confirmed_unannotated", index, sequence, text, parsed, {
      corrected: parsed,
      outcome: "confirmed",
    });
  }

  const text = `I finished the ${item.text}.`;
  const parsed = interpretation(text, "consume_item", { item_name: item.normalized }, 0.91);
  return makeRecord("confirmed_unannotated", index, sequence, text, parsed, {
    corrected: parsed,
    outcome: "confirmed",
  });
}

function holdoutRecord(index: number, sequence: number): SeededInferenceLogRecord {
  const item = holdoutItems[index % holdoutItems.length];
  const date = datePhrases[index % datePhrases.length];
  const location = locations[index % locations.length];
  const pattern = Math.floor(index / holdoutItems.length) % 4;
  const uuidLead = holdoutUuidLeads[index % holdoutUuidLeads.length];

  if (pattern === 0) {
    const text = `We picked up ${item.text} today.`;
    const reviewed = interpretation(text, "add_item", { item_name: item.normalized }, 1);
    return makeRecord("evaluation_holdout", index, sequence, text, reviewed, {
      corrected: reviewed,
      outcome: "confirmed",
      uuidLead,
    });
  }

  if (pattern === 1) {
    const text = `Store ${item.text} in the ${location}.`;
    const reviewed = interpretation(text, "add_item", { item_name: item.normalized, location }, 1);
    return makeRecord("evaluation_holdout", index, sequence, text, reviewed, {
      corrected: reviewed,
      outcome: "confirmed",
      uuidLead,
    });
  }

  if (pattern === 2) {
    const text = `The ${item.text} expires ${date.phrase}.`;
    return makeRecord(
      "evaluation_holdout",
      index,
      sequence,
      text,
      interpretation(text, "unknown", {}, 0.27),
      {
        corrected: interpretation(text, "update_expiry", {
          item_name: item.normalized,
          expiration_date: date.iso,
        }, 1),
        outcome: "corrected",
        uuidLead,
      },
    );
  }

  const text = `We need to buy ${item.text} before dinner.`;
  const reviewed = interpretation(text, "add_to_buy", { item_name: item.normalized }, 1);
  return makeRecord("evaluation_holdout", index, sequence, text, reviewed, {
    corrected: reviewed,
    outcome: "confirmed",
    uuidLead,
  });
}

export function buildQueueSeedRecords(plan: QueueSeedPlan): SeededInferenceLogRecord[] {
  const records: SeededInferenceLogRecord[] = [];
  let sequence = 0;

  for (let index = 0; index < plan.correction; index += 1) {
    records.push(correctionRecord(index, sequence));
    sequence += 1;
  }

  for (let index = 0; index < plan.expiry; index += 1) {
    records.push(expiryRecord(index, sequence));
    sequence += 1;
  }

  for (let index = 0; index < plan.low_confidence; index += 1) {
    records.push(lowConfidenceRecord(index, sequence));
    sequence += 1;
  }

  for (let index = 0; index < plan.confirmed_unannotated; index += 1) {
    records.push(confirmedRecord(index, sequence));
    sequence += 1;
  }

  for (let index = 0; index < plan.evaluation_holdout; index += 1) {
    records.push(holdoutRecord(index, sequence));
    sequence += 1;
  }

  return records;
}

export function seededQueueTargets(plan: QueueSeedPlan): Record<AnnotationQueueType, number> {
  return {
    correction: plan.correction,
    expiry: plan.expiry,
    low_confidence: plan.low_confidence,
    confirmed_unannotated: plan.confirmed_unannotated,
    evaluation_holdout: plan.evaluation_holdout,
  };
}
