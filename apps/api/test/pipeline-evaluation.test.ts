import { describe, expect, it } from "vitest";
import {
  evaluatePipelineCases,
} from "../src/nlp/pipeline-evaluation";
import { pipelineEvaluationFixtures } from "../src/nlp/pipeline-evaluation-fixtures";

describe("pipeline replay evaluation", () => {
  it("compares the parser baseline with the current pipeline without writes", () => {
    const report = evaluatePipelineCases(
      pipelineEvaluationFixtures,
      new Date("2026-11-09T12:00:00.000Z"),
    );

    expect(report).toMatchObject({
      mode: "shadow_replay",
      case_count: 11,
      baseline: {
        intent_accuracy: { accuracy: 1 },
        slot_exact_match: { accuracy: 1 },
      },
      current: {
        intent_accuracy: { accuracy: 1 },
        slot_exact_match: { accuracy: 1 },
        action_exact_match: { accuracy: 1 },
        relevance_accuracy: { accuracy: 1 },
        entity_resolution_accuracy: { accuracy: 1 },
      },
      safety: {
        database_writes: 0,
        event_writes: 0,
        raw_utterances_in_report: 0,
      },
    });
    expect(report.stage_metrics.relevance?.count).toBe(11);
    expect(report.stage_metrics.routing?.status_counts).toMatchObject({
      clarify: 1,
    });
  });

  it("rejects oversized evaluation inputs before replay", () => {
    expect(() =>
      evaluatePipelineCases(Array.from({ length: 1_001 }, (_, index) => ({
        id: `case-${index}`,
        text: "Add milk",
        expected: {
          intent: "add_item",
          slots: { item_name: "milk", location: "fridge" },
        },
      }))),
    ).toThrow("exceeds 1000 cases");
  });

  it("does not put raw utterances into the report", () => {
    const report = evaluatePipelineCases([{
      id: "private-text-case",
      text: "Add the private household phrase milk",
      expected: {
        intent: "add_item",
        slots: {
          item_name: "the private household phrase milk",
          location: "fridge",
        },
      },
    }]);

    expect(JSON.stringify(report)).not.toContain(
      "private household phrase",
    );
    expect(report.safety.raw_utterances_in_report).toBe(0);
  });
});
