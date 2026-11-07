import { z } from "zod";

const safeIdentifierPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

const SafeIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .regex(safeIdentifierPattern, "Expected a safe identifier");

export const PipelineVersionSchema = SafeIdentifierSchema.max(80);
export const StageVersionSchema = SafeIdentifierSchema.max(80);
export const ReasonCodeSchema = z.enum([
  "kitchen_command",
  "confirmation_required",
  "legacy_parser_baseline",
  "rules_parser_baseline",
  "rules_parser_failure",
  "rules_normalization_baseline",
  "rules_normalization_failure",
  "catalog_resolution_baseline",
  "catalog_resolution_failure",
  "routing_baseline",
  "proposal_baseline",
  "relevance_actionable",
  "relevance_contextual_preference",
  "relevance_domain_non_actionable",
  "relevance_unrelated",
  "relevance_ambiguous",
]);

const pipelineStageOrder = [
  "relevance",
  "correction_hint",
  "nlu",
  "normalization",
  "entity_resolution",
  "routing",
  "proposal",
] as const;

export const PipelineStageSchema = z.enum(pipelineStageOrder);

export const StageStatusSchema = z.enum([
  "completed",
  "skipped",
  "fallback",
  "clarify",
  "rejected",
  "failed",
]);

export const PipelineOutcomeSchema = z.enum([
  "proposal",
  "clarification",
  "not_actionable",
  "rejected",
  "failed",
]);

export const StageTraceSchema = z
  .object({
    stage: PipelineStageSchema,
    status: StageStatusSchema,
    version: StageVersionSchema,
    latency_ms: z.number().finite().nonnegative(),
    confidence: z.number().finite().min(0).max(1).optional(),
    reason_code: ReasonCodeSchema.optional(),
  })
  .strict();

export const PipelineTraceSchema = z
  .object({
    pipeline_version: PipelineVersionSchema,
    stages: z.array(StageTraceSchema).min(1).max(pipelineStageOrder.length),
    terminal_stage: PipelineStageSchema,
    outcome: PipelineOutcomeSchema,
  })
  .strict()
  .superRefine((trace, context) => {
    const seen = new Set<string>();

    for (let index = 0; index < trace.stages.length; index += 1) {
      const stage = trace.stages[index].stage;
      if (seen.has(stage)) {
        context.addIssue({
          code: "custom",
          path: ["stages", index, "stage"],
          message: "A pipeline stage may only appear once",
        });
      }
      seen.add(stage);

      if (index > 0) {
        const previous = pipelineStageOrder.indexOf(trace.stages[index - 1].stage);
        const current = pipelineStageOrder.indexOf(stage);
        if (current < previous) {
          context.addIssue({
            code: "custom",
            path: ["stages", index, "stage"],
            message: "Pipeline stages must remain in linear order",
          });
        }
      }
    }

    const terminalStage = trace.stages[trace.stages.length - 1]?.stage;
    if (terminalStage !== trace.terminal_stage) {
      context.addIssue({
        code: "custom",
        path: ["terminal_stage"],
        message: "terminal_stage must match the last recorded stage",
      });
    }
  });

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type PipelineOutcome = z.infer<typeof PipelineOutcomeSchema>;
export type StageTrace = z.infer<typeof StageTraceSchema>;
export type PipelineTrace = z.infer<typeof PipelineTraceSchema>;
