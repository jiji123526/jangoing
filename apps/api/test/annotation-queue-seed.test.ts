import { describe, expect, it } from "vitest";
import {
  buildQueueSeedRecords,
  defaultQueueSeedPlan,
} from "../src/annotations/queue-seed";

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
});
