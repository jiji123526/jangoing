import { describe, expect, it } from "vitest";
import { PipelineTraceSchema } from "@jangoing/contracts";
import {
  appendStageTrace,
  createPipelineTrace,
  finalizePipelineTrace,
} from "../src/nlp/pipeline-trace";

describe("pipeline trace", () => {
  it("builds a bounded stage trace without storing request content", () => {
    const initial = createPipelineTrace("linear-v1");
    const withRelevance = appendStageTrace(initial, {
      stage: "relevance",
      status: "completed",
      version: "rules-relevance-v1",
      latency_ms: 0.4,
      confidence: 0.98,
      reason_code: "kitchen_command",
    });
    const withProposal = appendStageTrace(withRelevance, {
      stage: "proposal",
      status: "completed",
      version: "proposal-v1",
      latency_ms: 0.2,
      reason_code: "confirmation_required",
    });
    const completed = finalizePipelineTrace(
      withProposal,
      "proposal",
      "proposal",
    );

    expect(completed).toEqual({
      pipeline_version: "linear-v1",
      stages: [
        {
          stage: "relevance",
          status: "completed",
          version: "rules-relevance-v1",
          latency_ms: 0.4,
          confidence: 0.98,
          reason_code: "kitchen_command",
        },
        {
          stage: "proposal",
          status: "completed",
          version: "proposal-v1",
          latency_ms: 0.2,
          reason_code: "confirmation_required",
        },
      ],
      terminal_stage: "proposal",
      outcome: "proposal",
    });
    expect(completed).not.toHaveProperty("text");
    expect(completed).not.toHaveProperty("raw_utterance");
    expect(PipelineTraceSchema.parse(completed)).toEqual(completed);
  });

  it("does not mutate an earlier trace when appending a stage", () => {
    const initial = createPipelineTrace("linear-v1");
    const updated = appendStageTrace(initial, {
      stage: "nlu",
      status: "fallback",
      version: "rules-v2",
      latency_ms: 1,
      reason_code: "legacy_parser_baseline",
    });

    expect(initial.stages).toHaveLength(0);
    expect(updated.stages).toHaveLength(1);
  });

  it("rejects invalid versions before a trace can be created", () => {
    expect(() => createPipelineTrace("")).toThrow();
    expect(() => createPipelineTrace("x".repeat(81))).toThrow();
  });

  it("rejects unbounded stage metadata", () => {
    expect(() =>
      appendStageTrace(createPipelineTrace("linear-v1"), {
        stage: "nlu",
        status: "failed",
        version: "rules-v2",
        latency_ms: 1,
        reason_code: "x".repeat(101),
      }),
    ).toThrow();
  });
});
