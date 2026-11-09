import type { z } from "zod";
import type { EvaluationCaseSchema } from "./pipeline-evaluation";

export type PipelineEvaluationFixture = z.input<typeof EvaluationCaseSchema>;

/**
 * Small, deterministic smoke holdout for the replay evaluator.
 *
 * This is not a human-approved test set. It exists to catch stage regressions
 * while the project has no live traffic or production shadow stream.
 */
export const pipelineEvaluationFixtures: readonly PipelineEvaluationFixture[] = [
  {
    id: "add-milk",
    text: "Add two cartons of milk",
    expected: {
      relevance: "actionable",
      intent: "add_item",
      slots: {
        item_name: "milk",
        quantity: 2,
        unit: "carton",
        location: "fridge",
      },
      entity_resolution: "resolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
  {
    id: "add-pantry-rice",
    text: "Add rice to the pantry",
    expected: {
      relevance: "actionable",
      intent: "add_item",
      slots: {
        item_name: "rice",
        location: "pantry",
      },
      entity_resolution: "resolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
  {
    id: "shopping-list-items",
    text: "Add milk, eggs to the shopping list",
    expected: {
      relevance: "actionable",
      intent: "add_to_buy",
      slots: { item_name: "milk" },
      actions: [
        { intent: "add_to_buy", slots: { item_name: "milk" } },
        { intent: "add_to_buy", slots: { item_name: "egg" } },
      ],
      entity_resolution: "resolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
  {
    id: "low-eggs",
    text: "We are low on eggs",
    expected: {
      relevance: "actionable",
      intent: "mark_low",
      slots: { item_name: "egg" },
      entity_resolution: "resolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
  {
    id: "inventory-query",
    text: "Do we have apples",
    expected: {
      relevance: "actionable",
      intent: "query_inventory",
      slots: { item_name: "apples" },
      entity_resolution: "resolved",
      routing: "read_only",
      proposal_kind: "read_only",
    },
  },
  {
    id: "ambiguous-kitchen-language",
    text: "Milk maybe later",
    expected: {
      relevance: "actionable",
      intent: "unknown",
      slots: {},
      routing: "clarify",
      proposal_kind: "clarification",
    },
  },
  {
    id: "contextual-preference",
    text: "I prefer oat milk",
    expected: {
      relevance: "contextual_preference",
      intent: "unknown",
      slots: {},
    },
  },
  {
    id: "domain-non-actionable",
    text: "The recipe says use milk",
    expected: {
      relevance: "domain_non_actionable",
      intent: "unknown",
      slots: {},
    },
  },
  {
    id: "unrelated-input",
    text: "The train was late again",
    expected: {
      relevance: "unrelated",
      intent: "unknown",
      slots: {},
    },
  },
  {
    id: "unresolved-item",
    text: "Add dragon fruit soda",
    expected: {
      relevance: "actionable",
      intent: "add_item",
      slots: {
        item_name: "dragon fruit soda",
        location: "fridge",
      },
      entity_resolution: "unresolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
  {
    id: "expiry-date",
    text: "Add yogurt expiring on November 12",
    reference_date: "2026-11-09",
    timezone: "UTC",
    expected: {
      relevance: "actionable",
      intent: "add_item",
      slots: {
        item_name: "yogurt",
        location: "fridge",
        expiration_date: "2026-11-12",
      },
      entity_resolution: "resolved",
      routing: "routable",
      proposal_kind: "mutation",
    },
  },
];
