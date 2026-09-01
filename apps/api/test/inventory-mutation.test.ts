import { describe, expect, it } from "vitest";
import { inventoryMutationEventType } from "../src/domain/inventory-mutation";

describe("inventory mutation", () => {
  it("removes an item when an edit saves quantity zero", () => {
    expect(inventoryMutationEventType("edit", 0)).toBe("item_removed");
  });

  it("keeps positive-quantity edits as adjustments", () => {
    expect(inventoryMutationEventType("edit", 1)).toBe("item_adjusted");
  });

  it("always treats an explicit removal as removal", () => {
    expect(inventoryMutationEventType("remove", null)).toBe("item_removed");
  });
});
