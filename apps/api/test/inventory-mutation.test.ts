import {
  AdjustInventoryItemRequestSchema,
  CreateEventRequestSchema,
  EventRecordSchema,
} from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import { inventoryMutationEventType } from "../src/domain/inventory-mutation";

describe("inventory mutation", () => {
  it("keeps an item when an edit saves quantity zero", () => {
    expect(inventoryMutationEventType("edit", 0)).toBe("item_adjusted");
  });

  it("keeps positive-quantity edits as adjustments", () => {
    expect(inventoryMutationEventType("edit", 1)).toBe("item_adjusted");
  });

  it("accepts a controlled category override or automatic category", () => {
    const baseAdjustment = {
      quantity: 1,
      unit: "carton",
      location: "fridge",
      expiration_date: null,
      low_threshold: null,
    } as const;

    expect(
      AdjustInventoryItemRequestSchema.safeParse({
        ...baseAdjustment,
        category: "dairy_eggs",
      }).success,
    ).toBe(true);
    expect(
      AdjustInventoryItemRequestSchema.safeParse({
        ...baseAdjustment,
        category: null,
      }).success,
    ).toBe(true);
    expect(
      AdjustInventoryItemRequestSchema.safeParse({
        ...baseAdjustment,
        category: "beverages",
      }).success,
    ).toBe(false);
  });

  it("always treats an explicit removal as removal", () => {
    expect(inventoryMutationEventType("remove", null)).toBe("item_removed");
  });

  it("reads historical zero-quantity events without allowing new ones", () => {
    const event = {
      event_type: "item_adjusted",
      item_name: "milk",
      quantity: 0,
      unit: "carton",
      location: "fridge",
      expiration_date: null,
      low_threshold: null,
      raw_utterance: "Inventory editor adjusted milk",
      confidence: 1,
      source: "web",
    } as const;

    expect(CreateEventRequestSchema.safeParse(event).success).toBe(false);
    expect(
      EventRecordSchema.safeParse({
        ...event,
        id: "historical-zero-event",
        created_at: "2026-08-31T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
