import { describe, expect, it } from "vitest";
import {
  buildAnnotationAssistantProposal,
  buildAnnotationAssistantUserPrompt,
  materializeProposalDraft,
  proposalMatchesActions,
} from "../src/annotations/assistant-proposal";

const context = {
  inference_id: "00000000-0000-4000-8000-000000000010",
  raw_utterance: "Please add milk and eggs expiring tomorrow.",
  predicted_interpretation: {
    intent: "add_item" as const,
    slots: {
      item_name: "milk",
      expiration_date: "2026-08-28",
    },
    confidence: 0.62,
    requires_confirmation: true,
    raw_utterance: "Please add milk and eggs expiring tomorrow.",
  },
};

describe("buildAnnotationAssistantProposal", () => {
  it("falls back to the parser when OPENAI_API_KEY is missing", async () => {
    const proposal = await buildAnnotationAssistantProposal({}, context);

    expect(proposal.provider).toBe("parser-fallback");
    expect(proposal.model).toBe("rules-v1");
    expect(proposal.actions).toEqual([{
      intent: "add_item",
      phrase_family: null,
      entities: [],
    }]);
    expect(proposal.note).toContain("OPENAI_API_KEY");
  });
});

describe("buildAnnotationAssistantUserPrompt", () => {
  it("passes existing normalized values as preferred canonical choices", () => {
    const preferred = Array.from({ length: 205 }, (_, index) => `item_${index}`);
    const prompt = JSON.parse(buildAnnotationAssistantUserPrompt({
      ...context,
      preferred_normalized_values: {
        ITEM: preferred,
        ITEM_CONDITION: ["fresh"],
        CATEGORY: ["dairy"],
        QUANTITY: [1, 2],
        UNIT: ["carton"],
        LOCATION: ["fridge"],
        EXPIRY_DATE: [],
      },
    }));

    expect(prompt.preferred_normalized_values.ITEM).toHaveLength(200);
    expect(prompt.preferred_normalized_values.ITEM[0]).toBe("item_0");
    expect(prompt.preferred_normalized_values.UNIT).toEqual(["carton"]);
    expect(prompt.preferred_normalized_values.ITEM_CONDITION).toBeUndefined();
  });
});

describe("materializeProposalDraft", () => {
  it("keeps item state wording as raw context instead of an entity", () => {
    expect(materializeProposalDraft("The milk is no longer usable", {
      actions: [{
        intent: "throw_away",
        phrase_family: "spoiled_item_discard",
        entities: [
          { label: "ITEM", text: "milk", normalized_value: "milk" },
          {
            label: "ITEM_CONDITION",
            text: "no longer usable",
            normalized_value: "unusable",
          },
        ],
      }],
    })).toEqual([{
      intent: "throw_away",
      phrase_family: "spoiled_item_discard",
      entities: [{
        label: "ITEM",
        start: 4,
        end: 8,
        text: "milk",
        normalized_value: "milk",
      }],
    }]);
  });

  it("keeps identity-changing modifiers inside the item span", () => {
    expect(materializeProposalDraft("Add frozen blueberries", {
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{
          label: "ITEM",
          text: "frozen blueberries",
          normalized_value: "frozen_blueberry",
        }],
      }],
    })).toEqual([{
      intent: "add_item",
      phrase_family: "explicit_add_to_inventory",
      entities: [{
        label: "ITEM",
        start: 4,
        end: 22,
        text: "frozen blueberries",
        normalized_value: "frozen_blueberry",
      }],
    }]);
  });

  it("drops incomplete AI entities without discarding the action", () => {
    expect(materializeProposalDraft("We are out of milk", {
      actions: [{
        intent: "mark_out",
        phrase_family: null,
        entities: [{ label: "ITEM", normalized_value: "milk" }],
      }],
    })).toEqual([{
      intent: "mark_out",
      phrase_family: null,
      entities: [],
    }]);
  });

  it("reconstructs entity spans from exact utterance text", () => {
    const actions = materializeProposalDraft(
      "We are out of milk, so add milk to the shopping list.",
      {
        actions: [{
          intent: "add_to_buy",
          phrase_family: "need_to_buy",
          entities: [
            { label: "ITEM", text: "milk", normalized_value: "milk" },
          ],
        }],
      },
    );

    expect(actions).toEqual([{
      intent: "add_to_buy",
      phrase_family: "need_to_buy",
      entities: [{
        label: "ITEM",
        start: 14,
        end: 18,
        text: "milk",
        normalized_value: "milk",
      }],
    }]);
  });

  it("uses valid AI offsets and falls back to exact text when offsets are wrong", () => {
    const actions = materializeProposalDraft("Add two cartons of oat milk", {
      actions: [{
        intent: "add_item",
        phrase_family: null,
        entities: [
          { label: "QUANTITY", text: "two", start: 4, end: 7, normalized_value: 2 },
          { label: "UNIT", text: "cartons", start: 99, end: 106, normalized_value: "carton" },
          { label: "ITEM", text: "oat milk", start: 19, end: 27, normalized_value: "oat_milk" },
        ],
      }],
    });

    expect(actions[0]?.entities).toEqual([
      { label: "QUANTITY", text: "two", start: 4, end: 7, normalized_value: 2 },
      { label: "UNIT", text: "cartons", start: 8, end: 15, normalized_value: "carton" },
      { label: "ITEM", text: "oat milk", start: 19, end: 27, normalized_value: "oat_milk" },
    ]);
  });

  it("drops invalid phrase families instead of failing the whole draft", () => {
    const actions = materializeProposalDraft(
      "Mark the milk as low.",
      {
        actions: [{
          intent: "mark_low",
          phrase_family: "not_a_real_family",
          entities: [
            { label: "ITEM", text: "milk", normalized_value: "milk" },
          ],
        }],
      },
    );

    expect(actions[0]?.phrase_family).toBeNull();
  });
});

describe("proposalMatchesActions", () => {
  it("compares proposals and saved actions by exact structured equality", () => {
    const actions = materializeProposalDraft(
      "Please throw away the spoiled milk.",
      {
        actions: [{
          intent: "throw_away",
          phrase_family: "spoiled_item_discard",
          entities: [
            { label: "ITEM", text: "milk", normalized_value: "milk" },
          ],
        }],
      },
    );

    expect(proposalMatchesActions({ actions }, actions)).toBe(true);
    expect(proposalMatchesActions({
      actions: [{
        ...actions[0],
        phrase_family: null,
      }],
    }, actions)).toBe(false);
  });
});
