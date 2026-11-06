import {
  InterpretationSchema,
  type InterpretCommandRequest,
  type Interpretation,
} from "@jangoing/contracts";
import { parseCommand } from "./parse-command";
import {
  StageTraceSchema,
  type StageTrace,
} from "./pipeline-contracts";
import {
  appendStageTrace,
  createPipelineTrace,
  finalizePipelineTrace,
} from "./pipeline-trace";

export const rulesNluVersion = "rules-v2";
export const linearPipelineVersion = "linear-v1";

export interface NluAdapterResult {
  interpretation: Interpretation;
  trace: StageTrace;
}

export function runRulesNluAdapter(
  request: InterpretCommandRequest,
): NluAdapterResult {
  const startedAt = Date.now();
  const interpretation = InterpretationSchema.parse(parseCommand(request));
  const trace = StageTraceSchema.parse({
    stage: "nlu",
    status: "completed",
    version: rulesNluVersion,
    latency_ms: Date.now() - startedAt,
    confidence: interpretation.confidence,
    reason_code: "rules_parser_baseline",
  });

  return { interpretation, trace };
}

export function buildBaselinePipelineTrace(
  result: NluAdapterResult,
) {
  return finalizePipelineTrace(
    appendStageTrace(
      createPipelineTrace(linearPipelineVersion),
      result.trace,
    ),
    "nlu",
    result.interpretation.intent === "unknown" ||
      result.interpretation.intent === "needs_clarification"
      ? "clarification"
      : "proposal",
  );
}
