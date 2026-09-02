import {
  FridgeSetupRequestSchema,
  type InventoryItem,
} from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import { buildFridgeSetupEvents } from "../src/domain/fridge-setup";
import { projectInventory } from "../src/domain/projections";

const existingMilk: InventoryItem = {
  item_name: "milk",
  category: null,
  added_at: "2026-08-30T12:00:00.000Z",
  quantity: 1,
  unit: "carton",
  location: "fridge",
  status: "in_stock",
  low_threshold: null,
  low_threshold_unit: null,
  nearest_expiration_date: null,
  expiry_state: "unknown",
};

describe("fridge setup", () => {
  it("rejects duplicate canonical item names", () => {
    const result = FridgeSetupRequestSchema.safeParse({
      items: [
        { item_name: "oat_milk", quantity: 1 },
        { item_name: "oat_milk", quantity: 2 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-canonical item names", () => {
    const result = FridgeSetupRequestSchema.safeParse({
      items: [{ item_name: "Oat Milk", quantity: 1 }],
    });

    expect(result.success).toBe(false);
  });

  it("adjusts existing items and adds new items with a setup source", () => {
    let nextId = 0;
    const events = buildFridgeSetupEvents(
      [
        {
          item_name: "milk",
          quantity: 2,
          unit: "carton",
          location: "fridge",
          expiration_date: null,
          low_threshold: 1,
        },
        {
          item_name: "frozen_blueberry",
          quantity: 1,
          unit: "bag",
          location: "freezer",
          expiration_date: null,
          low_threshold: null,
        },
      ],
      [existingMilk],
      "2026-08-31T12:00:00.000Z",
      () => `event-${nextId++}`,
    );

    expect(events.map((event) => event.event_type)).toEqual([
      "item_adjusted",
      "item_added",
    ]);
    expect(events.every((event) => event.source === "fridge_setup")).toBe(true);
    expect(events[0].low_threshold).toBe(1);
  });

  it("projects a low threshold included with a newly added setup item", () => {
    const [event] = buildFridgeSetupEvents(
      [{
        item_name: "milk",
        quantity: 1,
        unit: "carton",
        location: "fridge",
        expiration_date: null,
        low_threshold: 1,
      }],
      [],
      "2026-08-31T12:00:00.000Z",
      () => "event-1",
    );

    expect(projectInventory([event])[0]).toMatchObject({
      item_name: "milk",
      low_threshold: 1,
      low_threshold_unit: "carton",
      status: "low",
    });
  });
});
