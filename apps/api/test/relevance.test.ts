import { describe, expect, it } from "vitest";
import {
  buildNonActionableInterpretation,
  runRelevanceGate,
} from "../src/nlp/relevance";

describe("relevance gate", () => {
  it("passes explicit kitchen actions to NLU", () => {
    const result = runRelevanceGate({ text: "Add two cartons of milk" });

    expect(result).toMatchObject({
      relevance: "actionable",
      confidence: 0.96,
      passesToNlu: true,
      trace: {
        stage: "relevance",
        status: "completed",
        version: "rules-relevance-v1",
        reason_code: "relevance_actionable",
      },
    });
  });

  it("rejects personal preferences before NLU", () => {
    const result = runRelevanceGate({ text: "I prefer oat milk" });

    expect(result).toMatchObject({
      relevance: "contextual_preference",
      passesToNlu: false,
      trace: {
        status: "rejected",
        reason_code: "relevance_contextual_preference",
      },
    });
    expect(buildNonActionableInterpretation(
      { text: "I prefer oat milk" },
      result,
    )).toMatchObject({
      intent: "unknown",
      relevance: "contextual_preference",
      requires_confirmation: false,
    });
  });

  it("rejects grocery-domain observations and unrelated speech", () => {
    expect(runRelevanceGate({ text: "The recipe says to add milk" })).toMatchObject({
      relevance: "domain_non_actionable",
      passesToNlu: false,
    });
    expect(runRelevanceGate({ text: "The train was late again" })).toMatchObject({
      relevance: "unrelated",
      passesToNlu: false,
    });
    expect(runRelevanceGate({ text: "Add my dentist appointment" })).toMatchObject({
      relevance: "unrelated",
      passesToNlu: false,
    });
  });

  it("keeps ambiguous kitchen language on the NLU path", () => {
    const result = runRelevanceGate({ text: "Milk maybe later" });

    expect(result).toMatchObject({
      relevance: "actionable",
      confidence: 0.55,
      passesToNlu: true,
      trace: {
        status: "fallback",
        reason_code: "relevance_ambiguous",
      },
    });
  });
});
