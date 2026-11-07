import { describe, expect, it } from "vitest";
import { runInterpretationPipeline } from "../src/nlp/pipeline";

describe("interpretation pipeline", () => {
  it("owns the normal relevance-to-NLU stage order", () => {
    const result = runInterpretationPipeline(
      { text: "Add two cartons of milk" },
      new Date("2026-11-06T12:00:00.000Z"),
    );

    expect(result).toMatchObject({
      control: "continue",
      inferenceOutcome: "pending",
      parserVersion: "rules-v2",
      normalizerVersion: "normalizers-v2",
      interpretation: {
        intent: "add_item",
        relevance: "actionable",
        entity_resolution: {
          status: "resolved",
          canonical_key: "milk",
        },
      },
      trace: {
        terminal_stage: "proposal",
        outcome: "proposal",
        stages: [
          { stage: "relevance", status: "completed" },
          { stage: "nlu", status: "completed" },
          { stage: "normalization", status: "completed" },
          { stage: "entity_resolution", status: "completed" },
          { stage: "routing", status: "completed" },
          { stage: "proposal", status: "completed" },
        ],
      },
      routing: {
        status: "routable",
        event_types: ["item_added"],
      },
      proposal: {
        kind: "mutation",
        requires_confirmation: true,
      },
    });
  });

  it("does not invoke NLU for a rejected relevance result", () => {
    const result = runInterpretationPipeline(
      { text: "The train was late again" },
      new Date("2026-11-06T12:00:00.000Z"),
      {
        runNlu: () => {
          throw new Error("NLU should not run");
        },
      },
    );

    expect(result).toMatchObject({
      control: "reject",
      inferenceOutcome: "not_actionable",
      parserVersion: "not-run",
      normalizerVersion: "not-run",
      trace: {
        terminal_stage: "relevance",
        outcome: "not_actionable",
        stages: [{ stage: "relevance", status: "rejected" }],
      },
    });
  });

  it("keeps ambiguous kitchen language on the NLU path as fallback", () => {
    const result = runInterpretationPipeline(
      { text: "Milk maybe later" },
      new Date("2026-11-06T12:00:00.000Z"),
    );

    expect(result).toMatchObject({
      control: "clarify",
      inferenceOutcome: "pending",
      trace: {
        terminal_stage: "proposal",
        stages: [
          { stage: "relevance", status: "fallback" },
          { stage: "nlu", status: "completed" },
          { stage: "normalization", status: "completed" },
          { stage: "routing", status: "clarify" },
          { stage: "proposal", status: "clarify" },
        ],
      },
      proposal: {
        kind: "clarification",
        clarification_reason: "unknown_intent",
      },
    });
  });

  it("turns parser failures into a safe failed pipeline result", () => {
    const result = runInterpretationPipeline(
      { text: "Add milk" },
      new Date("2026-11-06T12:00:00.000Z"),
      {
        runNlu: () => {
          throw new Error("do not persist this error");
        },
      },
    );

    expect(result).toMatchObject({
      control: "fail",
      inferenceOutcome: "failed",
      interpretation: {
        intent: "unknown",
        confidence: 0,
      },
      trace: {
        terminal_stage: "nlu",
        outcome: "failed",
        stages: [
          { stage: "relevance", status: "completed" },
          {
            stage: "nlu",
            status: "failed",
            reason_code: "rules_parser_failure",
          },
        ],
      },
    });
    expect(JSON.stringify(result.trace)).not.toContain("do not persist");
  });

  it("keeps normalization failures separate from NLU failures", () => {
    const result = runInterpretationPipeline(
      { text: "Add milk" },
      new Date("2026-11-06T12:00:00.000Z"),
      {
        normalize: () => {
          throw new Error("do not persist this error");
        },
      },
    );

    expect(result).toMatchObject({
      control: "fail",
      inferenceOutcome: "failed",
      trace: {
        terminal_stage: "normalization",
        outcome: "failed",
        stages: [
          { stage: "relevance", status: "completed" },
          { stage: "nlu", status: "completed" },
          {
            stage: "normalization",
            status: "failed",
            reason_code: "rules_normalization_failure",
          },
        ],
      },
    });
    expect(JSON.stringify(result.trace)).not.toContain("do not persist");
  });

  it("accepts a household-scoped alias without changing the item name", () => {
    const result = runInterpretationPipeline(
      { text: "Add white milk" },
      new Date("2026-11-06T12:00:00.000Z"),
      {
        entityResolutionContext: {
          household_id: "household-a",
          aliases: [{
            household_id: "household-a",
            surface: "white milk",
            normalized_surface: "white milk",
            entity_type: "ITEM",
            canonical_key: "milk",
            category_id: "dairy",
            source: "manual",
            confidence: 0.99,
            evidence_count: 1,
          }],
        },
      },
    );

    expect(result.interpretation).toMatchObject({
      slots: { item_name: "white milk" },
      entity_resolution: {
        status: "resolved",
        canonical_key: "milk",
        candidates: [{ source: "household_alias" }],
      },
    });
  });
});
