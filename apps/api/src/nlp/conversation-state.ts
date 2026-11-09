import {
  CommandSlotsSchema,
  InterpretCommandRequestSchema,
  InterpretationSchema,
  IntentSchema,
  type CommandSlots,
  type InterpretCommandRequest,
  type Interpretation,
  type Intent,
  type RoutingResult,
  type ActionProposal,
} from "@jangoing/contracts";
import {
  buildActionProposal,
  routeInterpretation,
} from "./routing";
import { runInterpretationPipeline, type InterpretationPipelineResult } from "./pipeline";

const conversationStateTtlMs = 5 * 60 * 1000;
const maxConversationTurnGap = 8;
const continuationTextMaxLength = 500;

const resumableIntents = new Set<Intent>([
  "add_item",
  "add_to_buy",
  "consume_item",
  "mark_low",
  "mark_out",
  "throw_away",
  "query_inventory",
]);

const actionPrefixByIntent: Partial<Record<Intent, string>> = {
  add_item: "Add",
  add_to_buy: "Add",
  consume_item: "Used",
  mark_low: "Low on",
  mark_out: "Out of",
  throw_away: "Throw away",
  query_inventory: "Do we have",
};

export interface ConversationStateQueryScope {
  householdId: string | null;
}

export interface ConversationTurnRow {
  id: string;
  predicted_interpretation: string;
  request_context: string;
  outcome: string;
  created_at: string;
}

export interface PendingConversationState {
  conversation_id: string;
  source_inference_id: string;
  source_turn_index: number | null;
  intent: Intent;
  slots: CommandSlots;
  clarification_reason: NonNullable<ActionProposal["clarification_reason"]>;
  expires_at: string;
}

export interface ConversationTurnContext {
  resumed: boolean;
  source_inference_id: string | null;
}

export function buildLatestConversationTurnQuery(
  request: Pick<InterpretCommandRequest, "conversation_id" | "turn_index">,
  scope: ConversationStateQueryScope,
  before: Date,
): { query: string; bindings: Array<string | number> } | null {
  if (!request.conversation_id) {
    return null;
  }

  const conditions = [
    "json_extract(request_context, '$.conversation_id') = ?",
    "created_at < ?",
    scope.householdId === null ? "household_id IS NULL" : "household_id = ?",
  ];
  const bindings: Array<string | number> = [
    request.conversation_id,
    before.toISOString(),
  ];

  if (scope.householdId !== null) {
    bindings.push(scope.householdId);
  }

  if (request.turn_index !== undefined) {
    conditions.push(
      "CAST(json_extract(request_context, '$.turn_index') AS INTEGER) < ?",
    );
    bindings.push(request.turn_index);
  }

  return {
    query: `SELECT id, predicted_interpretation, request_context, outcome, created_at
      FROM inference_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY
        COALESCE(
          CAST(json_extract(request_context, '$.turn_index') AS INTEGER),
          -1
        ) DESC,
        created_at DESC,
        id DESC
      LIMIT 1`,
    bindings,
  };
}

function isIsoTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && value.length <= 80;
}

function parseRequestContext(value: string): {
  conversation_id?: string;
  turn_index?: number;
} | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const conversationId =
      typeof parsed.conversation_id === "string"
        ? parsed.conversation_id
        : undefined;
    const turnIndex =
      typeof parsed.turn_index === "number" &&
      Number.isInteger(parsed.turn_index) &&
      parsed.turn_index >= 0
        ? parsed.turn_index
        : undefined;

    return { conversation_id: conversationId, turn_index: turnIndex };
  } catch {
    return null;
  }
}

function expiresAtFor(createdAt: string): string | null {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return null;
  }
  return new Date(created.getTime() + conversationStateTtlMs).toISOString();
}

function clarificationReason(
  proposal: ActionProposal | undefined,
): PendingConversationState["clarification_reason"] | null {
  if (
    proposal?.kind !== "clarification" ||
    proposal.clarification_reason === undefined
  ) {
    return null;
  }
  return proposal.clarification_reason;
}

export function pendingConversationStateFromRow(
  row: ConversationTurnRow,
  now: Date,
): PendingConversationState | null {
  if (row.outcome !== "pending" || !isIsoTimestamp(row.created_at)) {
    return null;
  }

  const context = parseRequestContext(row.request_context);
  if (!context?.conversation_id) {
    return null;
  }

  const expiresAt = expiresAtFor(row.created_at);
  if (!expiresAt || new Date(expiresAt).getTime() <= now.getTime()) {
    return null;
  }

  const interpretation = safeStoredInterpretation(
    row.predicted_interpretation,
  );
  if (!interpretation) {
    return null;
  }

  const routing = routeInterpretation(interpretation);
  const proposal = buildActionProposal(interpretation, routing);
  const reason = clarificationReason(proposal);
  if (!reason || !resumableIntents.has(interpretation.intent)) {
    return null;
  }

  return {
    conversation_id: context.conversation_id,
    source_inference_id: row.id,
    source_turn_index: context.turn_index ?? null,
    intent: IntentSchema.parse(interpretation.intent),
    slots: CommandSlotsSchema.parse(interpretation.slots),
    clarification_reason: reason,
    expires_at: expiresAt,
  };
}

function safeStoredInterpretation(value: string): Interpretation | null {
  try {
    const parsed = JSON.parse(value);
    const result = InterpretationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function buildPendingConversationState(
  request: Pick<InterpretCommandRequest, "conversation_id" | "turn_index">,
  inferenceId: string,
  interpretation: Interpretation,
  proposal: ActionProposal | undefined,
  createdAt: Date,
): PendingConversationState | null {
  const reason = clarificationReason(proposal);
  const expiresAt = createdAt.getTime() >= 0
    ? new Date(createdAt.getTime() + conversationStateTtlMs).toISOString()
    : null;

  if (
    !request.conversation_id ||
    !reason ||
    !expiresAt ||
    !resumableIntents.has(interpretation.intent)
  ) {
    return null;
  }

  return {
    conversation_id: request.conversation_id,
    source_inference_id: inferenceId,
    source_turn_index: request.turn_index ?? null,
    intent: interpretation.intent,
    slots: CommandSlotsSchema.parse(interpretation.slots),
    clarification_reason: reason,
    expires_at: expiresAt,
  };
}

function isExplicitCommand(text: string): boolean {
  return /^(?:add|put|buy|get|we need|used|ate|drank|finished|low on|almost out of|running low on|out of|throw away|discard|do we have|is there|are there)\b/i
    .test(text);
}

function continuationRequest(
  request: InterpretCommandRequest,
  state: PendingConversationState,
): InterpretCommandRequest | null {
  const prefix = actionPrefixByIntent[state.intent];
  const text = request.text.trim();
  if (!prefix || !text || isExplicitCommand(text)) {
    return null;
  }

  const continuationText = state.intent === "add_to_buy"
    ? `${prefix} ${text} to the shopping list`
    : `${prefix} ${text}`;
  if (continuationText.length > continuationTextMaxLength) {
    return null;
  }

  return InterpretCommandRequestSchema.parse({
    ...request,
    text: continuationText,
  });
}

function mergeInterpretation(
  request: InterpretCommandRequest,
  state: PendingConversationState,
  result: InterpretationPipelineResult,
): Interpretation {
  const slots = CommandSlotsSchema.parse({
    ...state.slots,
    ...result.interpretation.slots,
  });
  return InterpretationSchema.parse({
    ...result.interpretation,
    slots,
    raw_utterance: request.text.trim(),
  });
}

export function runConversationAwarePipeline(
  request: InterpretCommandRequest,
  receivedAt: Date,
  state: PendingConversationState | null,
): {
  pipeline: InterpretationPipelineResult;
  context: ConversationTurnContext;
} {
  if (!state) {
    return {
      pipeline: runInterpretationPipeline(request, receivedAt),
      context: { resumed: false, source_inference_id: null },
    };
  }

  const sourceTurn = state.source_turn_index;
  if (
    request.conversation_id !== state.conversation_id ||
    (sourceTurn !== null &&
      request.turn_index !== undefined &&
      request.turn_index <= sourceTurn) ||
    (sourceTurn !== null &&
      request.turn_index !== undefined &&
      request.turn_index - sourceTurn > maxConversationTurnGap)
  ) {
    return {
      pipeline: runInterpretationPipeline(request, receivedAt),
      context: { resumed: false, source_inference_id: null },
    };
  }

  const continuation = continuationRequest(request, state);
  if (!continuation) {
    return {
      pipeline: runInterpretationPipeline(request, receivedAt),
      context: { resumed: false, source_inference_id: null },
    };
  }

  const resumed = runInterpretationPipeline(continuation, receivedAt);
  if (
    resumed.interpretation.intent !== state.intent ||
    resumed.control === "fail" ||
    resumed.control === "reject"
  ) {
    return {
      pipeline: runInterpretationPipeline(request, receivedAt),
      context: { resumed: false, source_inference_id: null },
    };
  }

  const interpretation = mergeInterpretation(request, state, resumed);
  const routing: RoutingResult = routeInterpretation(interpretation);
  const proposal = buildActionProposal(interpretation, routing);
  return {
    pipeline: {
      ...resumed,
      interpretation,
      routing,
      proposal,
    },
    context: {
      resumed: true,
      source_inference_id: state.source_inference_id,
    },
  };
}

export function parseStoredInterpretationForState(
  value: string,
): Interpretation | null {
  return safeStoredInterpretation(value);
}
