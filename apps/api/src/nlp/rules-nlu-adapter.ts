import {
  InterpretationSchema,
  type InterpretCommandRequest,
  type Interpretation,
} from "@jangoing/contracts";
import { runRulesNlu } from "./parse-command";
import type { RawNluResult } from "./nlu-contracts";
import {
  StageTraceSchema,
  type StageTrace,
} from "./pipeline-contracts";

export const rulesNluVersion = "rules-v2";
export const linearPipelineVersion = "linear-v1";

export interface NluAdapterResult {
  nlu: RawNluResult;
  trace: StageTrace;
}

export function runRulesNluAdapter(
  request: InterpretCommandRequest,
): NluAdapterResult {
  const startedAt = Date.now();
  const nlu = runRulesNlu(request);
  const trace = StageTraceSchema.parse({
    stage: "nlu",
    status: "completed",
    version: rulesNluVersion,
    latency_ms: Date.now() - startedAt,
    confidence: nlu.confidence,
    reason_code: "rules_parser_baseline",
  });

  return { nlu, trace };
}

export function addRelevanceMetadata(
  interpretation: Interpretation,
  relevance: {
    relevance: Interpretation["relevance"];
    confidence: number;
    version: string;
  },
): Interpretation {
  return InterpretationSchema.parse({
    ...interpretation,
    relevance: relevance.relevance,
    relevance_confidence: relevance.confidence,
    relevance_version: relevance.version,
  });
}
