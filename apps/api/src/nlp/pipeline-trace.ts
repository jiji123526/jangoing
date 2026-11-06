import {
  PipelineTraceSchema,
  StageTraceSchema,
  type PipelineOutcome,
  type PipelineStage,
  type PipelineTrace,
  type StageTrace,
} from "@jangoing/contracts";

export type PipelineTraceBuilder = {
  readonly pipeline_version: string;
  readonly stages: readonly StageTrace[];
};

export function createPipelineTrace(
  pipelineVersion: string,
): PipelineTraceBuilder {
  const normalizedVersion = pipelineVersion.trim();
  if (normalizedVersion.length === 0 || normalizedVersion.length > 80) {
    throw new Error("pipeline_version must contain 1 to 80 characters");
  }

  return {
    pipeline_version: normalizedVersion,
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
