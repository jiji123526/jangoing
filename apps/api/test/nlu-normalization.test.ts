import { describe, expect, it } from "vitest";
import { normalizeNluResult } from "../src/nlp/normalization";
import { runRulesNlu } from "../src/nlp/parse-command";
import { resolveTemporalGrounding } from "../src/nlp/temporal-grounding";

describe("NLU and normalization boundary", () => {
  it("keeps raw surface values and exact entity spans in NLU", () => {
    const result = runRulesNlu({ text: "Add two cartons of milk" });

    expect(result.slots).toMatchObject({
      item_name: "milk",
      quantity: "two",
      unit: "cartons",
    });
    expect(result.entities).toEqual([
      {
        type: "QUANTITY",
        text: "two",
        start: 4,
        end: 7,
      },
      {
        type: "UNIT",
        text: "cartons",
        start: 8,
        end: 15,
      },
      {
        type: "ITEM",
        text: "milk",
        start: 19,
        end: 23,
      },
    ]);
  });

  it("normalizes independently using the supplied temporal context", () => {
    const nlu = runRulesNlu({
      text: "Add eggs expiring next Friday",
      reference_date: "2026-08-26",
      timezone: "UTC",
    });
    const result = normalizeNluResult(
      nlu,
      resolveTemporalGrounding({
        reference_date: "2026-08-26",
        timezone: "UTC",
      }),
    );

    expect(result.interpretation).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "egg",
        location: "fridge",
        expiration_date: "2026-09-04",
      },
    });
    expect(result.trace).toMatchObject({
      stage: "normalization",
      version: "normalizers-v2",
      reason_code: "rules_normalization_baseline",
    });
  });
});
