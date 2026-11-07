import {
  InterpretationSchema,
  type Interpretation,
} from "@jangoing/contracts";

export type HouseholdAliasSource =
  | "manual"
  | "confirmed_correction"
  | "inventory_observed"
  | "asr_correction"
  | "imported_candidate";

export interface HouseholdEntityAlias {
  household_id: string;
  surface: string;
  normalized_surface: string;
  entity_type: "ITEM";
  canonical_key: string;
  category_id: string;
  source: HouseholdAliasSource;
  confidence: number;
  evidence_count: number;
}

export interface CorrectionEvidence {
  household_id: string | null;
  predicted_interpretation: unknown;
  corrected_interpretation: unknown;
  was_corrected: boolean;
}

export interface CorrectionHint {
  household_id: string;
  surface: string;
  normalized_surface: string;
  canonical_key: string;
  category_id: string;
  confidence: number;
  evidence_count: number;
}

const CorrectionInterpretationSchema = InterpretationSchema.pick({
  intent: true,
  slots: true,
  actions: true,
}).strict();

export function normalizePersonalSurface(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ");
}

function parseInterpretation(value: unknown): Interpretation | undefined {
  const parsed = CorrectionInterpretationSchema.safeParse(value);
  return parsed.success
    ? {
      intent: parsed.data.intent,
      slots: parsed.data.slots,
      ...(parsed.data.actions ? { actions: parsed.data.actions } : {}),
      confidence: 0,
      requires_confirmation: false,
      raw_utterance: "",
    }
    : undefined;
}

function itemNameOf(interpretation: Interpretation): string | undefined {
  return interpretation.slots.item_name?.trim() || undefined;
}

export function buildCorrectionHints(
  evidence: readonly CorrectionEvidence[],
  resolveCanonical: (
    itemName: string,
  ) => { canonical_key: string; category_id: string } | undefined,
  minimumEvidence = 2,
): CorrectionHint[] {
  const grouped = new Map<
    string,
    {
      household_id: string;
      surface: string;
      normalized_surface: string;
      canonical_key: string;
      category_id: string;
      evidence_count: number;
    }
  >();

  for (const record of evidence) {
    if (!record.was_corrected || !record.household_id) {
      continue;
    }

    const predicted = parseInterpretation(record.predicted_interpretation);
    const corrected = parseInterpretation(record.corrected_interpretation);
    if (!predicted || !corrected) {
      continue;
    }

    const surface = itemNameOf(predicted);
    const correctedItem = itemNameOf(corrected);
    if (!surface || !correctedItem) {
      continue;
    }

    const normalizedSurface = normalizePersonalSurface(surface);
    if (
      !normalizedSurface ||
      normalizedSurface === normalizePersonalSurface(correctedItem)
    ) {
      continue;
    }

    const canonical = resolveCanonical(correctedItem);
    if (!canonical) {
      continue;
    }

    const key = [
      record.household_id,
      normalizedSurface,
      canonical.canonical_key,
    ].join(":");
    const current = grouped.get(key);
    if (current) {
      current.evidence_count += 1;
      continue;
    }

    grouped.set(key, {
      household_id: record.household_id,
      surface,
      normalized_surface: normalizedSurface,
      canonical_key: canonical.canonical_key,
      category_id: canonical.category_id,
      evidence_count: 1,
    });
  }

  return [...grouped.values()]
    .filter((hint) => hint.evidence_count >= minimumEvidence)
    .map((hint) => ({
      ...hint,
      confidence: Number(
        Math.min(0.99, 0.7 + hint.evidence_count * 0.05).toFixed(3),
      ),
    }))
    .sort((left, right) =>
      left.household_id.localeCompare(right.household_id) ||
      left.normalized_surface.localeCompare(right.normalized_surface) ||
      left.canonical_key.localeCompare(right.canonical_key)
    );
}
