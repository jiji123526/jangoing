import { describe, expect, it } from "vitest";
import {
  linearPipelineVersion,
  rulesNluVersion,
  runRulesNluAdapter,
} from "../src/nlp/rules-nlu-adapter";

describe("rules NLU adapter", () => {
  it("emits raw NLU slots and an NLU trace", () => {
    const result = runRulesNluAdapter({
      text: "Add two cartons of milk",
      expiration_date: "2026-11-10",
    });

    expect(result.nlu).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "milk",
        quantity: "two",
        unit: "cartons",
        expiration_date: "2026-11-10",
      },
    });
    expect(result.trace).toMatchObject({
      stage: "nlu",
      status: "completed",
      version: rulesNluVersion,
      reason_code: "rules_parser_baseline",
      confidence: result.nlu.confidence,
    });
    expect(linearPipelineVersion).toBe("linear-v1");
  });

  it("does not turn an unknown parser result into a successful proposal", () => {
    const result = runRulesNluAdapter({ text: "Milk maybe later" });

    expect(result.nlu.intent).toBe("unknown");
    expect(result.trace.status).toBe("completed");
    expect(result.trace.confidence).toBe(0.2);
  });
});
