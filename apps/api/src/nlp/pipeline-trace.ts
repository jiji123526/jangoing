import {
  PipelineTraceSchema,
  PipelineVersionSchema,
  StageTraceSchema,
  type PipelineOutcome,
  type PipelineStage,
  type PipelineTrace,
  type StageTrace,
} from "./pipeline-contracts";

export type PipelineTraceBuilder = {
  readonly pipeline_version: string;
  readonly stages: readonly StageTrace[];
};

export function createPipelineTrace(
  pipelineVersion: string,
): PipelineTraceBuilder {
  return {
    pipeline_version: PipelineVersionSchema.parse(pipelineVersion),
    stages: [],
  };
}

export function appendStageTrace(
  trace: PipelineTraceBuilder,
  stage: StageTrace,
): PipelineTraceBuilder {
  const validatedStage = StageTraceSchema.parse(stage);

  return {
    pipeline_version: trace.pipeline_version,
    stages: [...trace.stages, validatedStage],
  };
}

export function finalizePipelineTrace(
  trace: PipelineTraceBuilder,
  terminalStage: PipelineStage,
  outcome: PipelineOutcome,
): PipelineTrace {
  return PipelineTraceSchema.parse({
    pipeline_version: trace.pipeline_version,
    stages: trace.stages,
    terminal_stage: terminalStage,
    outcome,
  });
}
