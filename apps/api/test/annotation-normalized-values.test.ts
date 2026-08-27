import { describe, expect, it } from "vitest";
import { collectAnnotationNormalizedValues } from "../src/annotations/normalized-values";

describe("collectAnnotationNormalizedValues", () => {
  it("keeps the shared defaults and appends reviewed custom values", () => {
    const values = collectAnnotationNormalizedValues([
      {
        actions: JSON.stringify([
          {
            intent: "add_item",
            entities: [
              {
                label: "ITEM",
                start: 0,
                end: 8,
                text: "oat milk",
                normalized_value: "oat_milk",
              },
              {
                label: "CATEGORY",
                start: 9,
                end: 14,
                text: "drink",
                normalized_value: "plant_milk",
              },
              {
                label: "ITEM_CONDITION",
                start: 15,
                end: 21,
                text: "frozen",
                normalized_value: "frozen",
              },
              {
                label: "UNIT",
                start: 22,
                end: 29,
                text: "gallons",
                normalized_value: "gallon",
              },
              {
                label: "QUANTITY",
                start: 30,
                end: 33,
                text: "1.5",
                normalized_value: 1.5,
              },
              {
                label: "EXPIRY_DATE",
                start: 34,
                end: 42,
                text: "tomorrow",
                normalized_value: "2026-08-28",
              },
            ],
          },
        ]),
        entities: null,
      },
    ]);

    expect(values.ITEM).toContain("milk");
    expect(values.ITEM).toContain("oat_milk");
    expect(values.ITEM_CONDITION).toContain("frozen");
    expect(values.CATEGORY).toContain("plant_milk");
    expect(values.UNIT).toContain("gallon");
    expect(values.QUANTITY).toContain(1.5);
    expect(values.EXPIRY_DATE).toContain("2026-08-28");
  });

  it("deduplicates values and falls back to legacy entities rows", () => {
    const values = collectAnnotationNormalizedValues([
      {
        actions: null,
        entities: JSON.stringify([
          {
            label: "ITEM",
            start: 0,
            end: 5,
            text: "eggs",
            normalized_value: "egg",
          },
          {
            label: "LOCATION",
            start: 6,
            end: 12,
            text: "fridge",
            normalized_value: "fridge",
          },
          {
            label: "ITEM_CONDITION",
            start: 13,
            end: 17,
            text: "ripe",
            normalized_value: "ripe",
          },
          {
            label: "QUANTITY",
            start: 18,
            end: 21,
            text: "two",
            normalized_value: "2",
          },
        ]),
      },
      {
        actions: JSON.stringify([
          {
            intent: "mark_low",
            entities: [
              {
                label: "ITEM",
                start: 0,
                end: 4,
                text: "eggs",
                normalized_value: "egg",
              },
            ],
          },
        ]),
        entities: null,
      },
    ]);

    expect(values.ITEM.filter((value) => value === "egg")).toHaveLength(1);
    expect(values.ITEM_CONDITION.filter((value) => value === "ripe")).toHaveLength(1);
    expect(values.LOCATION.filter((value) => value === "fridge")).toHaveLength(1);
    expect(values.QUANTITY.filter((value) => value === 2)).toHaveLength(1);
  });
});
