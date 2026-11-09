import { z } from "zod";
import {
  CommandSlotsSchema,
  InterpretCommandRequestSchema,
  IntentSchema,
  RelevanceSchema,
  type ActionProposal,
  type CommandSlots,
  type Interpretation,
  type Intent,
  type Relevance,
  type RoutingResult,
} from "@jangoing/contracts";
import { normalizeNluResult } from "./normalization";
import { runInterpretationPipeline } from "./pipeline";
import {
  pipelineStageOrder,
  type PipelineStage,
  type StageTrace,
} from "./pipeline-contracts";
import { resolveTemporalGrounding } from "./temporal-grounding";
import { runRulesNluAdapter } from "./rules-nlu-adapter";

const MAX_EVALUATION_CASES = 1_000;
const MAX_MISMATCH_IDS = 50;

const zRoutingStatus = z.enum(["routable", "read_only", "clarify", "reject"]);
const zProposalKind = z.enum([
  "mutation",
  "read_only",
  "clarification",
  "rejected",
]);

export const EvaluationCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
  text: z.string().trim().min(1).max(500),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  conversation_id: z.string().uuid().optional(),
  turn_index: z.number().int().nonnegative().optional(),
  speaker_role: z.enum(["user", "assistant", "system"]).optional(),
  activation_mode: z.enum([
    "manual_text",
    "push_to_talk",
    "wake_word",
    "always_listening",
  ]).optional(),
  expected: z.object({
    relevance: RelevanceSchema.optional(),
    intent: IntentSchema,
    slots: CommandSlotsSchema.default({}),
    actions: z.object({
      intent: IntentSchema,
      slots: CommandSlotsSchema,
    })
      .array()
      .max(8)
      .optional(),
    entity_resolution: z.enum(["resolved", "ambiguous", "unresolved"]).optional(),
    routing: zRoutingStatus.optional(),
    proposal_kind: zProposalKind.optional(),
  }).strict(),
}).strict();

type EvaluationCase = {
  id: string;
  text: string;
  expiration_date?: string;
  reference_date?: string;
  timezone?: string;
  expected: {
    relevance?: Relevance;
    intent: Intent;
    slots: CommandSlots;
    actions?: Array<{ intent: Intent; slots: CommandSlots }>;
    entity_resolution?: "resolved" | "ambiguous" | "unresolved";
    routing?: RoutingResult["status"];
    proposal_kind?: ActionProposal["kind"];
  };
};

type Metric = {
  correct: number;
  total: number;
  accuracy: number | null;
  mismatch_ids: string[];
};

type StageMetric = {
  count: number;
  status_counts: Partial<Record<StageTrace["status"], number>>;
  average_latency_ms: number;
};

type ModelMetrics = {
  intent_accuracy: Metric;
  slot_exact_match: Metric;
  action_exact_match: Metric;
  relevance_accuracy: Metric;
  entity_resolution_accuracy: Metric;
  routing_accuracy: Metric;
  proposal_kind_accuracy: Metric;
};

export type PipelineEvaluationReport = {
  mode: "shadow_replay";
  case_count: number;
  baseline: ModelMetrics;
  current: ModelMetrics;
  delta: {
    intent_accuracy: number | null;
    slot_exact_match: number | null;
    action_exact_match: number | null;
  };
  stage_metrics: Partial<Record<PipelineStage, StageMetric>>;
  safety: {
    database_writes: number;
    event_writes: number;
    raw_utterances_in_report: number;
  };
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function metric(
  rows: Array<{ id: string; correct: boolean }>,
): Metric {
  const correct = rows.filter((row) => row.correct).length;
  return {
    correct,
    total: rows.length,
    accuracy: rows.length === 0 ? null : correct / rows.length,
    mismatch_ids: rows
      .filter((row) => !row.correct)
      .slice(0, MAX_MISMATCH_IDS)
      .map((row) => row.id),
  };
}

function primaryActions(interpretation: Interpretation) {
  return interpretation.actions ?? [{
    intent: interpretation.intent,
    slots: interpretation.slots,
  }];
}

function expectedActions(testCase: EvaluationCase) {
  return testCase.expected.actions ?? [{
    intent: testCase.expected.intent,
    slots: testCase.expected.slots,
  }];
}

function comparableActions(
  actions: Array<{ intent: Intent; slots: CommandSlots }>,
) {
  return actions.map(({ intent, slots }) => ({ intent, slots }));
}

function actionMatch(
  actual: Interpretation,
  expected: EvaluationCase,
): boolean {
  return sameValue(
    comparableActions(primaryActions(actual)),
    comparableActions(expectedActions(expected)),
  );
}

function addModelRows(
  metrics: {
    intent: Array<{ id: string; correct: boolean }>;
    slots: Array<{ id: string; correct: boolean }>;
    actions: Array<{ id: string; correct: boolean }>;
    relevance: Array<{ id: string; correct: boolean }>;
    resolution: Array<{ id: string; correct: boolean }>;
    routing: Array<{ id: string; correct: boolean }>;
    proposal: Array<{ id: string; correct: boolean }>;
  },
  testCase: EvaluationCase,
  interpretation: Interpretation,
  routing: RoutingResult | undefined,
  proposal: ActionProposal | undefined,
  includePipelineStages: boolean,
) {
  metrics.intent.push({
    id: testCase.id,
    correct: interpretation.intent === testCase.expected.intent,
  });
  metrics.slots.push({
    id: testCase.id,
    correct: sameValue(interpretation.slots, testCase.expected.slots),
  });
  metrics.actions.push({
    id: testCase.id,
    correct: actionMatch(interpretation, testCase),
  });

  if (includePipelineStages && testCase.expected.relevance !== undefined) {
    metrics.relevance.push({
      id: testCase.id,
      correct: interpretation.relevance === testCase.expected.relevance,
    });
  }
  if (
    includePipelineStages &&
    testCase.expected.entity_resolution !== undefined
  ) {
    const actual = interpretation.entity_resolution?.status;
    metrics.resolution.push({
      id: testCase.id,
      correct: actual === testCase.expected.entity_resolution,
    });
  }
  if (includePipelineStages && testCase.expected.routing !== undefined) {
    metrics.routing.push({
      id: testCase.id,
      correct: routing?.status === testCase.expected.routing,
    });
  }
  if (includePipelineStages && testCase.expected.proposal_kind !== undefined) {
    metrics.proposal.push({
      id: testCase.id,
      correct: proposal?.kind === testCase.expected.proposal_kind,
    });
  }
}

function buildModelMetrics(rows: {
  intent: Array<{ id: string; correct: boolean }>;
  slots: Array<{ id: string; correct: boolean }>;
  actions: Array<{ id: string; correct: boolean }>;
  relevance: Array<{ id: string; correct: boolean }>;
  resolution: Array<{ id: string; correct: boolean }>;
  routing: Array<{ id: string; correct: boolean }>;
  proposal: Array<{ id: string; correct: boolean }>;
}): ModelMetrics {
  return {
    intent_accuracy: metric(rows.intent),
    slot_exact_match: metric(rows.slots),
    action_exact_match: metric(rows.actions),
    relevance_accuracy: metric(rows.relevance),
    entity_resolution_accuracy: metric(rows.resolution),
    routing_accuracy: metric(rows.routing),
    proposal_kind_accuracy: metric(rows.proposal),
  };
}

function collectStageMetrics(
  stageMetrics: Partial<Record<PipelineStage, StageMetric>>,
  stages: readonly StageTrace[],
) {
  for (const stage of stages) {
    const current = stageMetrics[stage.stage] ?? {
      count: 0,
      status_counts: {},
      average_latency_ms: 0,
    };
    const statusCount = current.status_counts[stage.status] ?? 0;
    stageMetrics[stage.stage] = {
      count: current.count + 1,
      status_counts: {
        ...current.status_counts,
        [stage.status]: statusCount + 1,
      },
      average_latency_ms:
        (current.average_latency_ms * current.count + stage.latency_ms) /
        (current.count + 1),
    };
  }
}

function roundStageMetrics(
  stageMetrics: Partial<Record<PipelineStage, StageMetric>>,
) {
  for (const stage of pipelineStageOrder) {
    const metricValue = stageMetrics[stage];
    if (metricValue) {
      metricValue.average_latency_ms =
        Math.round(metricValue.average_latency_ms * 100) / 100;
    }
  }
}

function rowsForModel() {
  return {
    intent: [] as Array<{ id: string; correct: boolean }>,
    slots: [] as Array<{ id: string; correct: boolean }>,
    actions: [] as Array<{ id: string; correct: boolean }>,
    relevance: [] as Array<{ id: string; correct: boolean }>,
    resolution: [] as Array<{ id: string; correct: boolean }>,
    routing: [] as Array<{ id: string; correct: boolean }>,
    proposal: [] as Array<{ id: string; correct: boolean }>,
  };
}

function parseCases(cases: readonly unknown[]): EvaluationCase[] {
  if (cases.length > MAX_EVALUATION_CASES) {
    throw new Error(`Evaluation input exceeds ${MAX_EVALUATION_CASES} cases`);
  }
  return cases.map((value) => EvaluationCaseSchema.parse(value));
}

export function evaluatePipelineCases(
  inputCases: readonly unknown[],
  receivedAt = new Date("2026-11-09T12:00:00.000Z"),
): PipelineEvaluationReport {
  const cases = parseCases(inputCases);
  const baselineRows = rowsForModel();
  const currentRows = rowsForModel();
  const stageMetrics: Partial<Record<PipelineStage, StageMetric>> = {};

  for (const testCase of cases) {
    const { id: _id, expected: _expected, ...rawRequest } = testCase;
    const request = InterpretCommandRequestSchema.parse(rawRequest);
    const temporalContext = resolveTemporalGrounding(request, receivedAt);
    const baselineNlu = runRulesNluAdapter(request);
    const baseline = normalizeNluResult(baselineNlu.nlu, temporalContext);
    addModelRows(
      baselineRows,
      testCase,
      baseline.interpretation,
      undefined,
      undefined,
      false,
    );

    const current = runInterpretationPipeline(request, receivedAt);
    addModelRows(
      currentRows,
      testCase,
      current.interpretation,
      current.routing,
      current.proposal,
      true,
    );
    collectStageMetrics(stageMetrics, current.trace.stages);
  }

  roundStageMetrics(stageMetrics);
  const baseline = buildModelMetrics(baselineRows);
  const current = buildModelMetrics(currentRows);
  return {
    mode: "shadow_replay",
    case_count: cases.length,
    baseline,
    current,
    delta: {
      intent_accuracy:
        baseline.intent_accuracy.accuracy === null ||
        current.intent_accuracy.accuracy === null
          ? null
          : current.intent_accuracy.accuracy -
            baseline.intent_accuracy.accuracy,
      slot_exact_match:
        baseline.slot_exact_match.accuracy === null ||
        current.slot_exact_match.accuracy === null
          ? null
          : current.slot_exact_match.accuracy -
            baseline.slot_exact_match.accuracy,
      action_exact_match:
        baseline.action_exact_match.accuracy === null ||
        current.action_exact_match.accuracy === null
          ? null
          : current.action_exact_match.accuracy -
            baseline.action_exact_match.accuracy,
    },
    stage_metrics: stageMetrics,
    safety: {
      database_writes: 0,
      event_writes: 0,
      raw_utterances_in_report: 0,
    },
  };
}
