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

  it("ignores inventory destination phrasing in add commands", () => {
    expect(
      parseCommand({
        text: "Add one egg to the inventory",
      }),
    ).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "egg",
        quantity: 1,
        location: "fridge",
      },
    });
    expect(
      parseCommand({
        text: "Put two cartons of milk in the inventory",
      }),
    ).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "milk",
        quantity: 2,
        unit: "carton",
        location: "fridge",
      },
    });
  });

  it("parses low-stock commands and normalizes simple aliases", () => {
    expect(parseCommand({ text: "We are low on eggs" })).toMatchObject({
      intent: "mark_low",
      slots: { item_name: "egg" },
    });
  });

  it("parses low-threshold policy commands", () => {
    expect(
      parseCommand({ text: "Tell me when milk reaches one carton" }),
    ).toMatchObject({
      intent: "set_low_threshold",
      slots: {
        item_name: "milk",
        low_threshold: 1,
        unit: "carton",
      },
      requires_confirmation: true,
    });
    expect(
      parseCommand({ text: "Set the low threshold for eggs to six pieces" }),
    ).toMatchObject({
      intent: "set_low_threshold",
      slots: {
        item_name: "egg",
        low_threshold: 6,
        unit: "piece",
      },
    });
    expect(parseCommand({ text: "Milk is low at two cartons" })).toMatchObject({
      intent: "set_low_threshold",
      slots: {
        item_name: "milk",
        low_threshold: 2,
        unit: "carton",
      },
    });
    expect(
      parseCommand({ text: "Let me know when we have two cans of soda left" }),
    ).toMatchObject({
      intent: "set_low_threshold",
      slots: {
        item_name: "soda",
        low_threshold: 2,
        unit: "can",
      },
    });
    expect(
      parseCommand({ text: "Change milk's low point to two cartons" }),
    ).toMatchObject({
      intent: "set_low_threshold",
      slots: {
        item_name: "milk",
        low_threshold: 2,
        unit: "carton",
      },
    });
  });

  it("parses out-of-stock statements as mark_out", () => {
    expect(parseCommand({ text: "We have no eggs" })).toMatchObject({
      intent: "mark_out",
      slots: { item_name: "egg" },
      requires_confirmation: true,
    });
    expect(parseCommand({ text: "We're out of milk" })).toMatchObject({
      intent: "mark_out",
      slots: { item_name: "milk" },
      requires_confirmation: true,
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

  it("parses multiple shopping-list items into action batches", () => {
    expect(
      parseCommand({
        text: "Add one apple, two bananas, one pineapple, and an ice cream to the shopping list",
      }),
    ).toMatchObject({
      intent: "add_to_buy",
      slots: { item_name: "apple", quantity: 1 },
      actions: [
        { intent: "add_to_buy", slots: { item_name: "apple", quantity: 1 } },
        { intent: "add_to_buy", slots: { item_name: "bananas", quantity: 2 } },
        { intent: "add_to_buy", slots: { item_name: "pineapple", quantity: 1 } },
        { intent: "add_to_buy", slots: { item_name: "ice cream", quantity: 1 } },
      ],
    });
  });

  it("returns unknown for unsupported language", () => {
    expect(parseCommand({ text: "Milk maybe later" })).toMatchObject({
      intent: "unknown",
      confidence: 0.2,
    });
  });

  it("normalizes natural-language expiry dates with an explicit reference date", () => {
    expect(parseCommand({
      text: "Add eggs with expiry date on August twenty-eighth",
      reference_date: "2026-08-26",
    })).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "egg",
        location: "fridge",
        expiration_date: "2026-08-28",
      },
    });
  });

  it("normalizes relative expiry phrases such as next friday", () => {
    expect(parseCommand({
      text: "Add milk expiring next Friday",
      reference_date: "2026-08-26",
    })).toMatchObject({
      intent: "add_item",
      slots: {
        item_name: "milk",
        location: "fridge",
        expiration_date: "2026-09-04",
      },
    });
  });
});
