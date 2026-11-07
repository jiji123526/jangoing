import { describe, expect, it } from "vitest";
import { InterpretationSchema } from "@jangoing/contracts";
import {
  buildActionProposal,
  confirmedEventTypesMatchProposal,
  routeInterpretation,
} from "../src/nlp/routing";

function interpretation(
  intent: "add_item" | "query_inventory" | "unknown",
  slots: Record<string, string | number> = {},
) {
  return InterpretationSchema.parse({
    intent,
    slots,
    confidence: 0.95,
    requires_confirmation: intent === "add_item",
    raw_utterance: "test",
  });
}

describe("routing and action proposals", () => {
  it("maps a supported mutation to a confirmation proposal", () => {
    const result = interpretation("add_item", { item_name: "milk" });
    const routing = routeInterpretation(result);
    const proposal = buildActionProposal(result, routing);

    expect(routing).toMatchObject({
      status: "routable",
      event_types: ["item_added"],
      mutation_risk: "reversible",
    });
    expect(proposal).toMatchObject({
      kind: "mutation",
      requires_confirmation: true,
      actions: [{ event_type: "item_added" }],
    });
    expect(
      confirmedEventTypesMatchProposal(proposal, ["item_added"]),
    ).toBe(true);
  });

  it("does not create a mutation proposal for a read-only query", () => {
    const result = interpretation("query_inventory", { item_name: "milk" });
    const routing = routeInterpretation(result);
    const proposal = buildActionProposal(result, routing);

    expect(routing.status).toBe("read_only");
    expect(proposal).toMatchObject({
      kind: "read_only",
      requires_confirmation: false,
      actions: [{ intent: "query_inventory" }],
    });
    expect(confirmedEventTypesMatchProposal(proposal, ["item_added"])).toBe(false);
  });

  it("allows unresolved custom items through the confirmation gate", () => {
    const result = InterpretationSchema.parse({
      ...interpretation("add_item", { item_name: "mystery item" }),
      entity_resolution: {
        surface: "mystery item",
        status: "unresolved",
        candidates: [],
        resolver_version: "catalog-v1",
      },
    });
    const routing = routeInterpretation(result);
    const proposal = buildActionProposal(result, routing);

    expect(routing).toMatchObject({
      status: "routable",
      reason_code: "supported_mutation",
    });
    expect(proposal).toMatchObject({
      kind: "mutation",
      requires_confirmation: true,
      actions: [{ event_type: "item_added" }],
    });
  });
});
