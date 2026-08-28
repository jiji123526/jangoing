import { describe, expect, it } from "vitest";
import {
  generatedReviewInterpretation,
  generatedReviewRelevance,
  generatedReviewSlots,
} from "../src/annotations/generated-review";

describe("generatedReviewSlots", () => {
  it("maps supported normalized fields into command slots", () => {
    expect(generatedReviewSlots({
      item_name: "oat_milk",
      quantity: 2,
      unit: "carton",
      location: "fridge",
      expiration_date: "2026-09-04",
      category: "beverage",
    })).toEqual({
      item_name: "oat_milk",
      quantity: 2,
      unit: "carton",
      location: "fridge",
      expiration_date: "2026-09-04",
    });
  });

  it("ignores unsupported or invalid normalized fields", () => {
    expect(generatedReviewSlots({
      category: "beverage",
      location: "counter",
      expiration_date: "tomorrow",
    })).toEqual({});
  });
});

describe("generatedReviewRelevance", () => {
  it("accepts supported candidate relevance values", () => {
    expect(generatedReviewRelevance("contextual_preference")).toBe("contextual_preference");
    expect(generatedReviewRelevance("domain_non_actionable")).toBe("domain_non_actionable");
    expect(generatedReviewRelevance("unrelated")).toBe("unrelated");
  });

  it("ignores missing or unsupported candidate relevance values", () => {
    expect(generatedReviewRelevance(undefined)).toBeUndefined();
    expect(generatedReviewRelevance("maybe")).toBeUndefined();
  });
});

describe("generatedReviewInterpretation", () => {
  it("builds a reviewed interpretation from a generated dataset record", () => {
    expect(generatedReviewInterpretation({
      text: "Buy eggs",
      intent: "add_to_buy",
      normalized: { item_name: "egg" },
    })).toMatchObject({
      intent: "add_to_buy",
      slots: {
        item_name: "egg",
      },
      confidence: 1,
      requires_confirmation: false,
      raw_utterance: "Buy eggs",
    });
  });
});
