import {
  InterpretationSchema,
  type InferenceOutcome,
  type InterpretCommandRequest,
  type Interpretation,
} from "@jangoing/contracts";
import {
  buildNonActionableInterpretation,
  runRelevanceGate,
  relevanceVersion,
  type RelevanceResult,
} from "./relevance";
import {
  buildBaselinePipelineTrace,
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
  type PipelineTrace,
} from "./pipeline-contracts";
import {
  resolveTemporalGrounding,
  type TemporalGroundingContext,
} from "./temporal-grounding";

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
}

export interface InterpretationPipelineDependencies {
  runNlu?: (request: InterpretCommandRequest) => NluAdapterResult;
}

const normalizerVersion = "normalizers-v1";

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
  const nluStartedAt = Date.now();

  try {
    const nlu = runNlu({ ...request, ...temporalContext });
    const interpretation = withRelevance(nlu.interpretation, relevance);
    const isClarification =
      nlu.interpretation.intent === "unknown" ||
      nlu.interpretation.intent === "needs_clarification";

    return {
      relevance,
      interpretation,
      trace: buildBaselinePipelineTrace(nlu, [relevance.trace]),
      temporalContext,
      control: isClarification
        ? "clarify"
        : relevance.trace.status === "fallback"
          ? "fallback"
          : "continue",
      inferenceOutcome: "pending",
      parserVersion: rulesNluVersion,
      normalizerVersion,
    };
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
}
