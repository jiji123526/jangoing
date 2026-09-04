import type { InventoryItem } from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import {
  inventoryAttentionSnapshot,
  inventoryNeedsAttention,
} from "../src/domain/inventory-attention";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    item_name: "milk",
    category: "dairy_eggs",
    thumbnail_url: overrides.thumbnail_url ?? null,
    added_at: "2026-09-01T00:00:00.000Z",
    quantity: 1,
    unit: "carton",
    location: "fridge",
    status: "in_stock",
    low_threshold: 1,
    low_threshold_unit: "carton",
    nearest_expiration_date: null,
    expiry_state: "unknown",
    ...overrides,
  };
}

describe("inventory attention acknowledgement", () => {
  it("recognizes stock and expiry attention states", () => {
    expect(inventoryNeedsAttention(item())).toBe(false);
    expect(inventoryNeedsAttention(item({ status: "low" }))).toBe(true);
    expect(inventoryNeedsAttention(item({ status: "out", quantity: 0 }))).toBe(true);
    expect(
      inventoryNeedsAttention(item({ expiry_state: "expiring_soon" })),
    ).toBe(true);
  });

  it("changes the snapshot when attention-relevant state changes", () => {
    const original = inventoryAttentionSnapshot(item({ status: "low" }));

    expect(
      inventoryAttentionSnapshot(item({ status: "out", quantity: 0 })),
    ).not.toBe(original);
    expect(
      inventoryAttentionSnapshot(
        item({
          status: "low",
          nearest_expiration_date: "2026-09-04",
          expiry_state: "expiring_soon",
        }),
      ),
    ).not.toBe(original);
  });
});
