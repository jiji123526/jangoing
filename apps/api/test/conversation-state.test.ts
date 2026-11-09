import { describe, expect, it } from "vitest";
import {
  buildLatestConversationTurnQuery,
  buildPendingConversationState,
  pendingConversationStateFromRow,
  runConversationAwarePipeline,
} from "../src/nlp/conversation-state";
import {
  buildActionProposal,
  routeInterpretation,
} from "../src/nlp/routing";
import { InterpretationSchema } from "@jangoing/contracts";

const conversationId = "00000000-0000-4000-8000-000000000010";
const inferenceId = "00000000-0000-4000-8000-000000000011";
const createdAt = new Date("2026-11-09T12:00:00.000Z");

function missingItemInterpretation() {
  return InterpretationSchema.parse({
    intent: "add_item",
    slots: {},
    confidence: 0.72,
    requires_confirmation: true,
    raw_utterance: "Add it",
  });
}

describe("conversation clarification state", () => {
  it("resumes a bounded item clarification without changing event boundaries", () => {
    const interpretation = missingItemInterpretation();
    const routing = routeInterpretation(interpretation);
    const proposal = buildActionProposal(interpretation, routing);
    const state = buildPendingConversationState(
      { conversation_id: conversationId, turn_index: 0 },
      inferenceId,
      interpretation,
      proposal,
      createdAt,
    );

    expect(state).toMatchObject({
      conversation_id: conversationId,
      source_inference_id: inferenceId,
      intent: "add_item",
      clarification_reason: "missing_item",
    });

    const resumed = runConversationAwarePipeline(
      {
        text: "milk",
        conversation_id: conversationId,
        turn_index: 1,
      },
      new Date("2026-11-09T12:01:00.000Z"),
      state,
    );

    expect(resumed.context).toEqual({
      resumed: true,
      source_inference_id: inferenceId,
    });
    expect(resumed.pipeline).toMatchObject({
      interpretation: {
        raw_utterance: "milk",
        intent: "add_item",
        slots: { item_name: "milk", location: "fridge" },
      },
      routing: { status: "routable" },
      proposal: {
        kind: "mutation",
        requires_confirmation: true,
      },
    });
  });

  it("does not store or consume unknown-intent clarification state", () => {
    const interpretation = InterpretationSchema.parse({
      intent: "unknown",
      slots: {},
      confidence: 0.2,
      requires_confirmation: false,
      raw_utterance: "Milk maybe later",
    });
    const proposal = buildActionProposal(
      interpretation,
      routeInterpretation(interpretation),
    );

    expect(
      buildPendingConversationState(
        { conversation_id: conversationId, turn_index: 0 },
        inferenceId,
        interpretation,
        proposal,
        createdAt,
      ),
    ).toBeNull();
  });

  it("rejects expired or malformed stored clarification turns", () => {
    const interpretation = missingItemInterpretation();
    const row = {
      id: inferenceId,
      predicted_interpretation: JSON.stringify(interpretation),
      request_context: JSON.stringify({
        conversation_id: conversationId,
        turn_index: 0,
      }),
      outcome: "pending",
      created_at: "2026-11-09T11:00:00.000Z",
    };

    expect(
      pendingConversationStateFromRow(
        row,
        new Date("2026-11-09T12:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      pendingConversationStateFromRow(
        { ...row, predicted_interpretation: "not-json" },
        new Date("2026-11-09T11:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("scopes the latest-turn query by conversation, household, and turn", () => {
    const result = buildLatestConversationTurnQuery(
      { conversation_id: conversationId, turn_index: 3 },
      { householdId: "00000000-0000-4000-8000-000000000020" },
      createdAt,
    );

    expect(result).not.toBeNull();
    expect(result?.query).toContain("household_id = ?");
    expect(result?.query).toContain("turn_index");
    expect(result?.bindings).toEqual([
      conversationId,
      createdAt.toISOString(),
      "00000000-0000-4000-8000-000000000020",
      3,
    ]);
  });
});
