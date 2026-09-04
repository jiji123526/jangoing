import type { InventoryItem } from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import { hasInventoryItemChanges } from "../lib/inventory-update";

function inventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    item_name: "milk",
    category: "dairy_eggs",
    thumbnail_url: null,
    added_at: "2026-09-04T12:00:00.000Z",
    quantity: 2,
    unit: "carton",
    location: "fridge",
    status: "in_stock",
    low_threshold: 1,
    low_threshold_unit: "carton",
    nearest_expiration_date: "2026-09-10",
    expiry_state: "fresh",
    ...overrides,
  };
}

describe("hasInventoryItemChanges", () => {
  it("returns false when the submitted update matches the current item", () => {
    const item = inventoryItem();

    expect(
      hasInventoryItemChanges(item, {
        quantity: 2,
        unit: "carton",
        location: "fridge",
        expiration_date: "2026-09-10",
        low_threshold: 1,
        category: "dairy_eggs",
      }),
    ).toBe(false);
  });

  it("normalizes empty values before comparing", () => {
    const item = inventoryItem({
      unit: null,
      location: null,
      low_threshold: null,
      nearest_expiration_date: null,
      category: null,
    });

    expect(
      hasInventoryItemChanges(item, {
        quantity: 2,
        unit: "",
        location: "" as InventoryItem["location"],
        expiration_date: null,
        low_threshold: null,
        category: null,
      }),
    ).toBe(false);
  });

  it("returns true when any tracked value changes", () => {
    const item = inventoryItem();

    expect(
      hasInventoryItemChanges(item, {
        quantity: 3,
        unit: "carton",
        location: "fridge",
        expiration_date: "2026-09-10",
        low_threshold: 1,
        category: "dairy_eggs",
      }),
    ).toBe(true);
  });
});
