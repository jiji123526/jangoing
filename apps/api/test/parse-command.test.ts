import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/nlp/parse-command";

describe("parseCommand", () => {
  it("parses an added item with quantity, unit, and expiry", () => {
    expect(
      parseCommand({
        text: "Add two cartons of milk",
        expiration_date: "2026-09-03",
      }),
    ).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "milk",
        quantity: 2,
        unit: "carton",
        location: "fridge",
        expiration_date: "2026-09-03",
      },
    });
  });

  it("parses low-stock commands and normalizes simple aliases", () => {
    expect(parseCommand({ text: "We are low on eggs" })).toMatchObject({
      intent: "mark_low",
      slots: { item_name: "egg" },
    });
  });

  it("requires confirmation for discarded items", () => {
    expect(parseCommand({ text: "Throw away the spinach" })).toMatchObject({
      intent: "throw_away",
      slots: { item_name: "spinach" },
      requires_confirmation: true,
    });
  });

  it("parses shopping-list commands before generic add commands", () => {
    expect(
      parseCommand({ text: "Put yogurt on the shopping list" }),
    ).toMatchObject({
      intent: "add_to_buy",
      slots: { item_name: "yogurt" },
    });
  });

  it("returns unknown for unsupported language", () => {
    expect(parseCommand({ text: "Milk maybe later" })).toMatchObject({
      intent: "unknown",
      confidence: 0.2,
    });
  });
});
