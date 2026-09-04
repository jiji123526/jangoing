import type { EventRecord } from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import {
  projectInventory,
  projectShoppingList,
} from "../src/domain/projections";

function event(
  overrides: Partial<EventRecord> &
    Pick<EventRecord, "event_type" | "item_name">,
): EventRecord {
  return {
    id: crypto.randomUUID(),
    quantity: null,
    unit: null,
    location: null,
    expiration_date: null,
    raw_utterance: "test",
    confidence: 1,
    source: "web",
    created_at: "2026-08-26T10:00:00.000Z",
    ...overrides,
  };
}

describe("projectInventory", () => {
  it("tracks quantity and nearest batch expiry", () => {
    const inventory = projectInventory(
      [
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
          expiration_date: "2026-09-10",
        }),
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 1,
          unit: "carton",
          location: "fridge",
          expiration_date: "2026-09-02",
        }),
      ],
      new Date("2026-08-26T12:00:00Z"),
    );

    expect(inventory[0]).toMatchObject({
      item_name: "milk",
      category: null,
      added_at: "2026-08-26T10:00:00.000Z",
      quantity: 3,
      nearest_expiration_date: "2026-09-02",
      expiry_state: "fresh",
    });
  });

  it("marks an item low even without a recorded quantity", () => {
    expect(
      projectInventory([
        event({ event_type: "item_marked_low", item_name: "egg" }),
      ])[0],
    ).toMatchObject({
      item_name: "egg",
      quantity: 0,
      status: "low",
    });
  });

  it("marks an item out and clears remaining inventory", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
        }),
        event({ event_type: "item_marked_out", item_name: "milk" }),
      ])[0],
    ).toMatchObject({
      item_name: "milk",
      quantity: 0,
      status: "out",
    });
  });

  it("replaces the projected item state after an inventory edit", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
        }),
        event({
          event_type: "item_adjusted",
          item_name: "milk",
          quantity: 1,
          unit: "bottle",
          location: "pantry",
          expiration_date: "2026-09-04",
          created_at: "2026-08-28T09:00:00.000Z",
        }),
      ], new Date("2026-08-30T12:00:00Z"))[0],
    ).toMatchObject({
      added_at: "2026-08-26T10:00:00.000Z",
      quantity: 1,
      unit: "bottle",
      location: "pantry",
      low_threshold: null,
      nearest_expiration_date: "2026-09-04",
    });
  });

  it("uses the purchase time as the added date for shopping purchases", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added_to_buy",
          item_name: "milk",
          created_at: "2026-08-25T10:00:00.000Z",
        }),
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          created_at: "2026-08-29T10:00:00.000Z",
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        item_name: "milk",
        added_at: "2026-08-29T10:00:00.000Z",
        quantity: 2,
        unit: "carton",
      }),
    ]);
  });

  it("persists and clears a category override through inventory edits", () => {
    const categorizedEvents = [
      event({
        event_type: "item_added",
        item_name: "coke_zero",
        quantity: 2,
      }),
      event({
        event_type: "item_adjusted",
        item_name: "coke_zero",
        quantity: 2,
        category: "drinks",
      }),
    ];
    const inventory = projectInventory(categorizedEvents);
    const resetInventory = projectInventory([
      ...categorizedEvents,
      event({
        event_type: "item_adjusted",
        item_name: "coke_zero",
        quantity: 2,
        category: "automatic",
      }),
    ]);

    expect(inventory[0].category).toBe("drinks");
    expect(resetInventory[0].category).toBeNull();
  });

  it("keeps a category override when another adjustment has no category", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_adjusted",
          item_name: "coke_zero",
          quantity: 2,
          category: "drinks",
        }),
        event({
          event_type: "item_adjusted",
          item_name: "coke_zero",
          quantity: 3,
        }),
      ])[0],
    ).toMatchObject({
      category: "drinks",
      quantity: 3,
    });
  });

  it("derives low and out status from quantity and the item threshold", () => {
    const lowInventory = projectInventory([
      event({
        event_type: "item_adjusted",
        item_name: "egg",
        quantity: 6,
        unit: "piece",
        low_threshold: 6,
      }),
    ]);
    const outInventory = projectInventory([
      event({
        event_type: "item_adjusted",
        item_name: "milk",
        quantity: 0,
        unit: "carton",
        low_threshold: 1,
      }),
    ]);

    expect(lowInventory[0]).toMatchObject({
      quantity: 6,
      low_threshold: 6,
      status: "low",
    });
    expect(outInventory[0]).toMatchObject({
      quantity: 0,
      low_threshold: 1,
      status: "out",
    });
  });

  it("preserves an explicit low status when only metadata is edited", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "egg",
          quantity: 12,
          unit: "piece",
          location: "fridge",
        }),
        event({ event_type: "item_marked_low", item_name: "egg" }),
        event({
          event_type: "item_adjusted",
          item_name: "egg",
          quantity: 12,
          unit: "piece",
          location: "fridge",
          expiration_date: "2026-09-10",
          low_threshold: null,
        }),
      ])[0],
    ).toMatchObject({
      quantity: 12,
      status: "low",
      nearest_expiration_date: "2026-09-10",
    });
  });

  it("recalculates an explicit status when quantity changes", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "egg",
          quantity: 2,
        }),
        event({ event_type: "item_marked_low", item_name: "egg" }),
        event({
          event_type: "item_adjusted",
          item_name: "egg",
          quantity: 12,
          low_threshold: 6,
        }),
      ])[0],
    ).toMatchObject({
      quantity: 12,
      low_threshold: 6,
      status: "in_stock",
    });
  });

  it("applies a threshold policy without replacing inventory batches", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 1,
          unit: "carton",
          location: "fridge",
        }),
        event({
          event_type: "item_low_threshold_set",
          item_name: "milk",
          low_threshold: 1,
          unit: "carton",
        }),
      ])[0],
    ).toMatchObject({
      item_name: "milk",
      quantity: 1,
      unit: "carton",
      location: "fridge",
      low_threshold: 1,
      low_threshold_unit: "carton",
      status: "low",
    });
  });

  it("keeps a threshold-only item hidden until inventory is added", () => {
    const events = [
      event({
        event_type: "item_low_threshold_set",
        item_name: "milk",
        low_threshold: 1,
        unit: "carton",
      }),
    ];

    expect(projectInventory(events)).toEqual([]);
    expect(
      projectInventory([
        ...events,
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 1,
          unit: "carton",
        }),
      ])[0],
    ).toMatchObject({
      quantity: 1,
      low_threshold: 1,
      low_threshold_unit: "carton",
      status: "low",
    });
  });

  it("does not compare a threshold against an incompatible inventory unit", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "soda",
          quantity: 2,
          unit: "bottle",
        }),
        event({
          event_type: "item_low_threshold_set",
          item_name: "soda",
          low_threshold: 2,
          unit: "can",
        }),
      ])[0],
    ).toMatchObject({
      quantity: 2,
      unit: "bottle",
      low_threshold: 2,
      low_threshold_unit: "can",
      status: "in_stock",
    });
  });

  it("removes an item from the projected list without treating it as consumed", () => {
    expect(
      projectInventory([
        event({ event_type: "item_added", item_name: "milk", quantity: 1 }),
        event({ event_type: "item_removed", item_name: "milk" }),
      ]),
    ).toEqual([]);
  });

  it("adds purchased shopping context to inventory", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added_to_buy",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
          expiration_date: "2026-09-10",
        }),
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
          expiration_date: "2026-09-10",
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        item_name: "milk",
        quantity: 2,
        unit: "carton",
        location: "fridge",
        nearest_expiration_date: "2026-09-10",
        status: "in_stock",
      }),
    ]);
  });

  it("does not retroactively stock legacy purchases without context", () => {
    expect(
      projectInventory([
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          quantity: null,
        }),
      ]),
    ).toEqual([]);
  });

  it("does not change inventory when a shopping item is deleted", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 2,
        }),
        event({
          event_type: "shopping_item_deleted",
          item_name: "milk",
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        item_name: "milk",
        quantity: 2,
      }),
    ]);
  });

  it("removes only the purchased batch when a shopping item is restored", () => {
    expect(
      projectInventory([
        event({
          event_type: "item_added",
          item_name: "milk",
          quantity: 1,
          unit: "carton",
        }),
        event({
          event_type: "item_added_to_buy",
          item_name: "milk",
        }),
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          quantity: 2,
          unit: "carton",
        }),
        event({
          event_type: "shopping_item_restored",
          item_name: "milk",
        }),
      ]),
    ).toEqual([
      expect.objectContaining({
        item_name: "milk",
        quantity: 1,
        unit: "carton",
      }),
    ]);
  });

  it("restores an out-of-stock item after undoing its purchase", () => {
    const events = [
      event({
        event_type: "item_marked_out",
        item_name: "milk",
      }),
      event({
        event_type: "item_added_to_buy",
        item_name: "milk",
        quantity: 2,
        unit: "carton",
      }),
      event({
        event_type: "shopping_item_purchased",
        item_name: "milk",
        quantity: 2,
        unit: "carton",
      }),
      event({
        event_type: "shopping_item_restored",
        item_name: "milk",
        quantity: 2,
        unit: "carton",
      }),
    ];

    expect(projectInventory(events)).toEqual([
      expect.objectContaining({
        item_name: "milk",
        quantity: 0,
        status: "out",
      }),
    ]);
  });
});

describe("projectShoppingList", () => {
  it("deduplicates shopping-list additions", () => {
    const list = projectShoppingList([
      event({ event_type: "item_added_to_buy", item_name: "yogurt" }),
      event({ event_type: "item_added_to_buy", item_name: "yogurt" }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0].item_name).toBe("yogurt");
    expect(list[0].status).toBe("active");
    expect(list[0].quantity).toBe(1);
  });

  it("removes a deleted item from the shopping queue", () => {
    expect(
      projectShoppingList([
        event({ event_type: "item_added_to_buy", item_name: "milk" }),
        event({ event_type: "shopping_item_deleted", item_name: "milk" }),
      ]),
    ).toEqual([]);
  });

  it("moves purchased items into a retained completed state", () => {
    const list = projectShoppingList(
      [
        event({
          event_type: "item_added_to_buy",
          item_name: "milk",
          created_at: "2026-08-30T10:00:00.000Z",
        }),
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          created_at: "2026-08-31T09:00:00.000Z",
        }),
      ],
      new Date("2026-08-31T12:00:00.000Z"),
    );

    expect(list).toEqual([{
      item_name: "milk",
      thumbnail_url: null,
      added_at: "2026-08-30T10:00:00.000Z",
      status: "purchased",
      purchased_at: "2026-08-31T09:00:00.000Z",
      quantity: 1,
      unit: null,
      location: null,
      expiration_date: null,
    }]);
  });

  it("preserves purchase context on the shopping item", () => {
    const list = projectShoppingList([
      event({
        event_type: "item_added_to_buy",
        item_name: "milk",
        quantity: 2,
        unit: "carton",
        location: "fridge",
        expiration_date: "2026-09-10",
      }),
    ]);

    expect(list[0]).toMatchObject({
      item_name: "milk",
      quantity: 2,
      unit: "carton",
      location: "fridge",
      expiration_date: "2026-09-10",
    });
  });

  it("restores purchased items to the active queue", () => {
    const list = projectShoppingList([
      event({ event_type: "item_added_to_buy", item_name: "milk" }),
      event({ event_type: "shopping_item_purchased", item_name: "milk" }),
      event({ event_type: "shopping_item_restored", item_name: "milk" }),
    ]);

    expect(list[0]).toMatchObject({
      item_name: "milk",
      status: "active",
      purchased_at: null,
    });
  });

  it("reactivates a purchased item when it is added again", () => {
    const list = projectShoppingList([
      event({ event_type: "item_added_to_buy", item_name: "milk" }),
      event({ event_type: "shopping_item_purchased", item_name: "milk" }),
      event({
        event_type: "item_added_to_buy",
        item_name: "milk",
        created_at: "2026-08-27T10:00:00.000Z",
      }),
    ]);

    expect(list[0]).toMatchObject({
      item_name: "milk",
      status: "active",
      purchased_at: null,
      added_at: "2026-08-27T10:00:00.000Z",
    });
  });

  it("hides purchased items after the retention window", () => {
    const list = projectShoppingList(
      [
        event({
          event_type: "item_added_to_buy",
          item_name: "milk",
          created_at: "2026-08-29T08:00:00.000Z",
        }),
        event({
          event_type: "shopping_item_purchased",
          item_name: "milk",
          created_at: "2026-08-30T08:00:00.000Z",
        }),
      ],
      new Date("2026-08-31T12:00:00.000Z"),
    );

    expect(list).toEqual([]);
  });
});
