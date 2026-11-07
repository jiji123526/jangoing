import {
  InterpretationSchema,
  type InferenceOutcome,
  type InterpretCommandRequest,
  type Interpretation,
  type ActionProposal,
  type RoutingResult,
} from "@jangoing/contracts";
import {
  buildNonActionableInterpretation,
  runRelevanceGate,
  relevanceVersion,
  type RelevanceResult,
} from "./relevance";
import {
  linearPipelineVersion,
  rulesNluVersion,
  addRelevanceMetadata,
  runRulesNluAdapter,
  type NluAdapterResult,
} from "./rules-nlu-adapter";
import {
  buildPipelineTrace,
} from "./pipeline-trace";
import {
  StageTraceSchema,
  type StageTrace,
  type PipelineTrace,
} from "./pipeline-contracts";
import {
  normalizeNluResult,
  normalizerVersion,
  type NormalizationResult,
} from "./normalization";
import {
  catalogResolverVersion,
  resolveInterpretationEntities,
  type EntityResolutionResult,
  type EntityResolutionContext,
} from "./entity-resolution";
import {
  resolveTemporalGrounding,
  type TemporalGroundingContext,
} from "./temporal-grounding";
import {
  buildActionProposal,
  buildProposalTrace,
  buildRoutingTrace,
  routeInterpretation,
} from "./routing";

export type PipelineControl =
  | "continue"
  | "fallback"
  | "clarify"
  | "reject"
  | "fail";

export interface InterpretationPipelineResult {
  relevance: RelevanceResult;
  interpretation: Interpretation;
  trace: PipelineTrace;
  temporalContext: TemporalGroundingContext;
  control: PipelineControl;
  inferenceOutcome: InferenceOutcome;
  parserVersion: string;
  normalizerVersion: string;
  routing?: RoutingResult;
  proposal?: ActionProposal;
}

export interface InterpretationPipelineDependencies {
  runNlu?: (request: InterpretCommandRequest) => NluAdapterResult;
  normalize?: (
    nlu: NluAdapterResult["nlu"],
    temporalContext: TemporalGroundingContext,
  ) => NormalizationResult;
  resolveEntities?: (
    interpretation: Interpretation,
    context?: EntityResolutionContext,
  ) => EntityResolutionResult;
  entityResolutionContext?: EntityResolutionContext;
}

function withRelevance(
  interpretation: Interpretation,
  relevance: RelevanceResult,
): Interpretation {
  return addRelevanceMetadata(interpretation, {
    relevance: relevance.relevance,
    confidence: relevance.confidence,
    version: relevanceVersion,
  });
}

function failedInterpretation(
  request: InterpretCommandRequest,
  relevance: RelevanceResult,
): Interpretation {
  return withRelevance(
    InterpretationSchema.parse({
      intent: "unknown",
      slots: {},
      confidence: 0,
      requires_confirmation: false,
      raw_utterance: request.text.trim(),
    }),
    relevance,
  );
}

export function runInterpretationPipeline(
  request: InterpretCommandRequest,
  receivedAt = new Date(),
  dependencies: InterpretationPipelineDependencies = {},
): InterpretationPipelineResult {
  const relevance = runRelevanceGate(request);
  const temporalContext = resolveTemporalGrounding(request, receivedAt);

  if (!relevance.passesToNlu) {
    return {
      relevance,
      interpretation: buildNonActionableInterpretation(request, relevance),
      trace: buildPipelineTrace(
        linearPipelineVersion,
        [relevance.trace],
        "relevance",
        "not_actionable",
      ),
      temporalContext,
      control: "reject",
      inferenceOutcome: "not_actionable",
      parserVersion: "not-run",
      normalizerVersion: "not-run",
    };
  }

  const runNlu = dependencies.runNlu ?? runRulesNluAdapter;
  const runNormalization = dependencies.normalize ?? normalizeNluResult;
  const runEntityResolution =
    dependencies.resolveEntities ?? resolveInterpretationEntities;
  const nluStartedAt = Date.now();

  let nlu: NluAdapterResult;
  try {
    nlu = runNlu({ ...request, ...temporalContext });
  } catch {
    const failedStage = StageTraceSchema.parse({
      stage: "nlu",
      status: "failed",
      version: rulesNluVersion,
      latency_ms: Date.now() - nluStartedAt,
      reason_code: "rules_parser_failure",
    });

    return {
      relevance,
      interpretation: failedInterpretation(request, relevance),
      trace: buildPipelineTrace(
        linearPipelineVersion,
        [relevance.trace, failedStage],
        "nlu",
        "failed",
      ),
      temporalContext,
      control: "fail",
      inferenceOutcome: "failed",
      parserVersion: rulesNluVersion,
      normalizerVersion: "not-run",
    };
  }

  const normalizationStartedAt = Date.now();
  try {
    const normalized = runNormalization(nlu.nlu, temporalContext);
    const hasEntityToResolve = Boolean(
      normalized.interpretation.slots.item_name ||
      normalized.interpretation.actions?.some((action) =>
        Boolean(action.slots.item_name)
      ),
    );

    let interpreted = normalized.interpretation;
    const stages: StageTrace[] = [relevance.trace, nlu.trace, normalized.trace];

    if (hasEntityToResolve) {
      const resolutionStartedAt = Date.now();
      try {
        const resolved = runEntityResolution(
          normalized.interpretation,
          dependencies.entityResolutionContext,
        );
        interpreted = resolved.interpretation;
        stages.push(resolved.trace);
      } catch {
        const failedStage = StageTraceSchema.parse({
          stage: "entity_resolution",
          status: "failed",
          version: catalogResolverVersion,
          latency_ms: Date.now() - resolutionStartedAt,
          reason_code: "catalog_resolution_failure",
        });

        return {
          relevance,
          interpretation: failedInterpretation(request, relevance),
          trace: buildPipelineTrace(
            linearPipelineVersion,
            [...stages, failedStage],
            "entity_resolution",
            "failed",
          ),
          temporalContext,
          control: "fail",
          inferenceOutcome: "failed",
          parserVersion: rulesNluVersion,
          normalizerVersion,
        };
      }
    }

    const interpretation = withRelevance(interpreted, relevance);
    const routingStartedAt = Date.now();
    const routing = routeInterpretation(interpretation);
    const routingTrace = buildRoutingTrace(routing, routingStartedAt);
    const proposalStartedAt = Date.now();
    const proposal = buildActionProposal(interpretation, routing);
    const proposalTrace = buildProposalTrace(routing, proposalStartedAt);
    const outcome =
      routing.status === "clarify"
        ? "clarification"
        : routing.status === "reject"
          ? "rejected"
          : "proposal";

    return {
      relevance,
      interpretation,
      trace: buildPipelineTrace(
        linearPipelineVersion,
        [...stages, routingTrace, proposalTrace],
        "proposal",
        outcome,
      ),
      temporalContext,
      control:
        routing.status === "clarify"
          ? "clarify"
          : routing.status === "reject"
            ? "reject"
            : relevance.trace.status === "fallback"
              ? "fallback"
              : "continue",
      inferenceOutcome: routing.status === "reject" ? "rejected" : "pending",
      parserVersion: rulesNluVersion,
      normalizerVersion,
      routing,
      proposal,
    };
  } catch {
    const failedStage = StageTraceSchema.parse({
      stage: "normalization",
      status: "failed",
      version: normalizerVersion,
      latency_ms: Date.now() - normalizationStartedAt,
      reason_code: "rules_normalization_failure",
    });

    return {
      relevance,
      interpretation: failedInterpretation(request, relevance),
      trace: buildPipelineTrace(
        linearPipelineVersion,
        [relevance.trace, nlu.trace, failedStage],
        "normalization",
        "failed",
      ),
      temporalContext,
      control: "fail",
      inferenceOutcome: "failed",
      parserVersion: rulesNluVersion,
      normalizerVersion,
    };
  }
}
