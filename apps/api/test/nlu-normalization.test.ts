import { describe, expect, it } from "vitest";
import { resolveCatalogItem } from "../src/nlp/entity-resolution";
import { normalizeNluResult } from "../src/nlp/normalization";
import { buildCorrectionHints } from "../src/nlp/personal-adapter";
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

  it("resolves catalog aliases without changing the user-facing item name", () => {
    expect(resolveCatalogItem("red apples")).toMatchObject({
      surface: "red apples",
      status: "resolved",
      canonical_key: "apple",
      candidates: [
        {
          canonical_key: "apple",
          category_id: "produce",
          matched_alias: "red apples",
          source: "shared_catalog",
          score: 1,
        },
      ],
    });
    expect(resolveCatalogItem("unlisted pantry item")).toMatchObject({
      surface: "unlisted pantry item",
      status: "unresolved",
      candidates: [],
    });
  });

  it("uses only repeated household-scoped corrections as hints", () => {
    const corrected = {
      intent: "add_item",
      slots: { item_name: "oat milk", location: "fridge" },
    };
    const predicted = {
      intent: "add_item",
      slots: { item_name: "oat beverage", location: "fridge" },
    };
    const hints = buildCorrectionHints(
      [
        {
          household_id: "household-a",
          predicted_interpretation: predicted,
          corrected_interpretation: corrected,
          was_corrected: true,
        },
        {
          household_id: "household-a",
          predicted_interpretation: predicted,
          corrected_interpretation: corrected,
          was_corrected: true,
        },
        {
          household_id: "household-b",
          predicted_interpretation: predicted,
          corrected_interpretation: corrected,
          was_corrected: true,
        },
      ],
      (itemName) => {
        const resolution = resolveCatalogItem(itemName);
        return resolution.status === "resolved" && resolution.canonical_key
          ? {
            canonical_key: resolution.canonical_key,
            category_id: resolution.candidates[0].category_id,
          }
          : undefined;
      },
    );

    expect(hints).toEqual([
      {
        household_id: "household-a",
        surface: "oat beverage",
        normalized_surface: "oat beverage",
        canonical_key: "oat_milk",
        category_id: "dairy",
        confidence: 0.8,
        evidence_count: 2,
      },
    ]);
  });

  it("does not reuse another household's alias", () => {
    const alias = {
      household_id: "household-a",
      surface: "the white milk",
      normalized_surface: "the white milk",
      entity_type: "ITEM" as const,
      canonical_key: "milk",
      category_id: "dairy",
      source: "manual" as const,
      confidence: 0.99,
      evidence_count: 1,
    };

    expect(
      resolveCatalogItem("the white milk", {
        household_id: "household-a",
        aliases: [alias],
      }),
    ).toMatchObject({
      status: "resolved",
      canonical_key: "milk",
      candidates: [{ source: "household_alias" }],
    });
    expect(
      resolveCatalogItem("the white milk", {
        household_id: "household-b",
        aliases: [alias],
      }),
    ).toMatchObject({
      status: "unresolved",
      candidates: [],
    });
  });
});
