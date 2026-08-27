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
});

describe("projectShoppingList", () => {
  it("deduplicates shopping-list additions", () => {
    const list = projectShoppingList([
      event({ event_type: "item_added_to_buy", item_name: "yogurt" }),
      event({ event_type: "item_added_to_buy", item_name: "yogurt" }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0].item_name).toBe("yogurt");
  });
});
