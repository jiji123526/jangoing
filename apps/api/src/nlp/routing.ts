import {
  ActionProposalSchema,
  RoutingResultSchema,
  type EventType,
  type Interpretation,
  type RoutingResult,
  type ActionProposal,
} from "@jangoing/contracts";
import {
  StageTraceSchema,
  type StageTrace,
} from "./pipeline-contracts";

export const routingVersion = "routing-v1";
export const proposalVersion = "proposal-v1";

type RouteDefinition = {
  eventType: EventType;
  mutationRisk: "reversible" | "destructive";
};

const mutationRoutes: Partial<
  Record<Interpretation["intent"], RouteDefinition>
> = {
  add_item: { eventType: "item_added", mutationRisk: "reversible" },
  consume_item: { eventType: "item_consumed", mutationRisk: "reversible" },
  mark_low: { eventType: "item_marked_low", mutationRisk: "reversible" },
  mark_out: { eventType: "item_marked_out", mutationRisk: "reversible" },
  throw_away: { eventType: "item_thrown_away", mutationRisk: "destructive" },
  add_to_buy: { eventType: "item_added_to_buy", mutationRisk: "reversible" },
  set_low_threshold: {
    eventType: "item_low_threshold_set",
    mutationRisk: "reversible",
  },
};

function interpretationActions(
  interpretation: Interpretation,
): NonNullable<Interpretation["actions"]> {
  return interpretation.actions ?? [{
    intent: interpretation.intent,
    slots: interpretation.slots,
    ...(interpretation.entity_resolution
      ? { entity_resolution: interpretation.entity_resolution }
      : {}),
  }];
}

function entityResolutionStatus(
  action: NonNullable<Interpretation["actions"]>[number],
): "ambiguous" | "unresolved" | null {
  if (action.entity_resolution?.status === "ambiguous") {
    return "ambiguous";
  }
  if (action.entity_resolution?.status === "unresolved") {
    return "unresolved";
  }
  return null;
}

export function routeInterpretation(
  interpretation: Interpretation,
): RoutingResult {
  const actions = interpretationActions(interpretation);
  const firstEntityProblem = actions
    .map(entityResolutionStatus)
    .find((status): status is "ambiguous" | "unresolved" => status !== null);

  if (firstEntityProblem === "ambiguous") {
    return RoutingResultSchema.parse({
      status: "clarify",
      reason_code: "ambiguous_entity",
      mutation_risk: "none",
      event_types: [],
      router_version: routingVersion,
    });
  }
  const missingItem = actions.some(
    (action) =>
      mutationRoutes[action.intent] !== undefined &&
      action.slots.item_name === undefined,
  );
  if (missingItem) {
    return RoutingResultSchema.parse({
      status: "clarify",
      reason_code: "missing_item",
      mutation_risk: "none",
      event_types: [],
      router_version: routingVersion,
    });
  }

  if (interpretation.intent === "unknown" ||
      interpretation.intent === "needs_clarification") {
    return RoutingResultSchema.parse({
      status: "clarify",
      reason_code: "unknown_intent",
      mutation_risk: "none",
      event_types: [],
      router_version: routingVersion,
    });
  }

  if (interpretation.intent === "query_inventory") {
    return RoutingResultSchema.parse({
      status: "read_only",
      reason_code: "read_only_query",
      mutation_risk: "none",
      event_types: [],
      router_version: routingVersion,
    });
  }

  const definitions = actions.map((action) => mutationRoutes[action.intent]);
  if (definitions.some((definition) => !definition)) {
    return RoutingResultSchema.parse({
      status: "reject",
      reason_code: "unsupported_intent",
      mutation_risk: "none",
      event_types: [],
      router_version: routingVersion,
    });
  }

  const resolvedDefinitions = definitions as RouteDefinition[];
  return RoutingResultSchema.parse({
    status: "routable",
    reason_code: "supported_mutation",
    mutation_risk: resolvedDefinitions.some(
      (definition) => definition.mutationRisk === "destructive",
    )
      ? "destructive"
      : "reversible",
    event_types: resolvedDefinitions.map((definition) => definition.eventType),
    router_version: routingVersion,
  });
}

export function buildRoutingTrace(
  routing: RoutingResult,
  startedAt: number,
): StageTrace {
  return StageTraceSchema.parse({
    stage: "routing",
    status:
      routing.status === "clarify"
        ? "clarify"
        : routing.status === "reject"
          ? "rejected"
          : "completed",
    version: routingVersion,
    latency_ms: Date.now() - startedAt,
    reason_code: "routing_baseline",
  });
}

export function buildActionProposal(
  interpretation: Interpretation,
  routing: RoutingResult,
): ActionProposal {
  const actions = interpretationActions(interpretation);
  const definitions = actions.map((action) => mutationRoutes[action.intent]);

  const proposalActions = actions.map((action, index) => ({
    ...action,
    ...(definitions[index] ? { event_type: definitions[index].eventType } : {}),
  }));

  return ActionProposalSchema.parse({
    kind:
      routing.status === "routable"
        ? "mutation"
        : routing.status === "read_only"
          ? "read_only"
          : routing.status === "clarify"
            ? "clarification"
            : "rejected",
    requires_confirmation: routing.status === "routable",
    mutation_risk: routing.mutation_risk,
    actions:
      routing.status === "reject" ||
      routing.status === "clarify"
        ? []
        : proposalActions,
    ...(routing.status === "clarify"
      ? { clarification_reason: routing.reason_code }
      : {}),
    proposal_version: proposalVersion,
  });
}

export function buildProposalTrace(
  routing: RoutingResult,
  startedAt: number,
): StageTrace {
  return StageTraceSchema.parse({
    stage: "proposal",
    status:
      routing.status === "clarify"
        ? "clarify"
        : routing.status === "reject"
          ? "rejected"
          : "completed",
    version: proposalVersion,
    latency_ms: Date.now() - startedAt,
    reason_code: "proposal_baseline",
  });
}

export function isMutationProposal(proposal: ActionProposal): boolean {
  return proposal.kind === "mutation" && proposal.requires_confirmation;
}

export function confirmedEventTypesMatchProposal(
  proposal: ActionProposal,
  eventTypes: readonly EventType[],
): boolean {
  if (!isMutationProposal(proposal) || proposal.actions.length !== eventTypes.length) {
    return false;
  }

  return proposal.actions.every(
    (action, index) => action.event_type === eventTypes[index],
  );
}
