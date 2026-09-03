import { describe, expect, it } from "vitest";
import {
  inventoryHref,
  parseInventoryNavigation,
} from "../lib/inventory-navigation";

describe("inventory navigation", () => {
  it("parses allowlisted scope and item without opening edit mode", () => {
    const intent = parseInventoryNavigation(
      new URLSearchParams("scope=out&item=oat_milk&action=edit"),
    );

    expect(intent).toEqual({
      scope: "out",
      item: "oat_milk",
    });
  });

  it("falls back safely for unsupported navigation values", () => {
    expect(
      parseInventoryNavigation(
        new URLSearchParams("scope=deleted&action=edit"),
      ),
    ).toEqual({
      scope: "all",
      item: null,
    });
  });

  it("builds shareable contextual inventory links", () => {
    expect(inventoryHref({ scope: "expiring" })).toBe(
      "/inventory?scope=expiring",
    );
    expect(
      inventoryHref({ scope: "low", item: "oat milk" }),
    ).toBe("/inventory?scope=low&item=oat+milk");
    expect(inventoryHref()).toBe("/inventory");
  });
});
