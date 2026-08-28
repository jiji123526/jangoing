import { describe, expect, it } from "vitest";
import {
  annotationQueueSeedSource,
  buildQueueSeedRecords,
  defaultQueueSeedPlan,
  expirySeedDateCases,
} from "../src/annotations/queue-seed";
import {
  extractInlineExpiry,
  normalizeExpiryDate,
} from "../src/nlp/temporal-grounding";

describe("buildQueueSeedRecords", () => {
  it("builds the requested number of deterministic queue seed records", () => {
    const plan = defaultQueueSeedPlan();
    const records = buildQueueSeedRecords(plan);

    expect(records).toHaveLength(
      plan.correction +
      plan.expiry +
      plan.low_confidence +
      plan.confirmed_unannotated +
      plan.evaluation_holdout,
    );
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    expect(records.every((record) => record.source === annotationQueueSeedSource)).toBe(true);
    expect(records.every((record) => record.id[1] === "2")).toBe(true);
  });

  it("reserves holdout-compatible ids and mixes queue-specific outcomes", () => {
    const records = buildQueueSeedRecords({
      correction: 2,
      expiry: 4,
      low_confidence: 2,
      confirmed_unannotated: 2,
      evaluation_holdout: 6,
    });

    const holdoutRecords = records.slice(-6);
    expect(holdoutRecords.every((record) => /^[012]/.test(record.id))).toBe(true);
    expect(holdoutRecords.every((record) => record.corrected_interpretation !== null)).toBe(true);

    const correctionRecords = records.slice(0, 2);
    expect(correctionRecords.every((record) => record.outcome === "corrected")).toBe(true);

    const lowConfidenceRecords = records.slice(6, 8);
    expect(lowConfidenceRecords.every((record) => record.outcome === "pending")).toBe(true);
  });

  it("validates every explicit expiry date case with the shared normalizer", () => {
    for (const dateCase of expirySeedDateCases) {
      expect(normalizeExpiryDate(dateCase.phrase, dateCase)).toBe(dateCase.iso);
    }
  });

  it("keeps every generated expiry phrase consistent with its stored context", () => {
    const records = buildQueueSeedRecords({
      correction: 0,
      expiry: 48,
      low_confidence: 0,
      confirmed_unannotated: 0,
      evaluation_holdout: 24,
    });
    const expiryRecords = records.filter((record) =>
      extractInlineExpiry(record.raw_utterance).expirationDateText !== undefined
    );

    expect(expiryRecords).toHaveLength(54);
    for (const record of expiryRecords) {
      const context = JSON.parse(record.request_context) as {
        reference_date: string;
        timezone: string;
      };
      const expiryText = extractInlineExpiry(record.raw_utterance).expirationDateText;
      const reviewed = record.corrected_interpretation
        ? JSON.parse(record.corrected_interpretation) as {
            slots: { expiration_date?: string };
          }
        : null;
      const expected = normalizeExpiryDate(expiryText, context);

      expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (reviewed?.slots.expiration_date) {
        expect(reviewed.slots.expiration_date).toBe(expected);
      }
    }
  });
});
