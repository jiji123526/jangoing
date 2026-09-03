import { describe, expect, it } from "vitest";
import { resolvedInventoryCategory } from "../lib/inventory-category";

describe("inventory categories", () => {
  it("prefers a user-selected category", () => {
    expect(
      resolvedInventoryCategory({
        item_name: "apple",
        category: "snacks",
      }),
    ).toBe("Snacks");
  });

  it("falls back to the inferred display category", () => {
    expect(
      resolvedInventoryCategory({
        item_name: "apple",
        category: null,
      }),
    ).toBe("Produce");
  });
});
