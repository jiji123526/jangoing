import {
  evaluatePipelineCases,
  type PipelineEvaluationReport,
} from "../src/nlp/pipeline-evaluation";
import { pipelineEvaluationFixtures } from "../src/nlp/pipeline-evaluation-fixtures";

function metricText(
  metric: { accuracy: number | null; correct: number; total: number },
): string {
  return metric.accuracy === null
    ? "n/a"
    : `${(metric.accuracy * 100).toFixed(1)}% (${metric.correct}/${metric.total})`;
}

function printSummary(report: PipelineEvaluationReport) {
  console.log(`mode: ${report.mode}`);
  console.log(`cases: ${report.case_count}`);
  console.log("");
  console.log("metric                         baseline       current");
  console.log(
    `intent_accuracy               ${metricText(report.baseline.intent_accuracy).padEnd(15)}${metricText(report.current.intent_accuracy)}`,
  );
  console.log(
    `slot_exact_match              ${metricText(report.baseline.slot_exact_match).padEnd(15)}${metricText(report.current.slot_exact_match)}`,
  );
  console.log(
    `action_exact_match            ${metricText(report.baseline.action_exact_match).padEnd(15)}${metricText(report.current.action_exact_match)}`,
  );
  console.log(
    `relevance_accuracy            ${metricText(report.baseline.relevance_accuracy).padEnd(15)}${metricText(report.current.relevance_accuracy)}`,
  );
  console.log(
    `entity_resolution_accuracy    ${metricText(report.baseline.entity_resolution_accuracy).padEnd(15)}${metricText(report.current.entity_resolution_accuracy)}`,
  );
  console.log(
    `routing_accuracy              ${metricText(report.baseline.routing_accuracy).padEnd(15)}${metricText(report.current.routing_accuracy)}`,
  );
  console.log(
    `proposal_kind_accuracy        ${metricText(report.baseline.proposal_kind_accuracy).padEnd(15)}${metricText(report.current.proposal_kind_accuracy)}`,
  );
  console.log("");
  console.log("stage metrics:");
  for (const [stage, value] of Object.entries(report.stage_metrics)) {
    console.log(
      `- ${stage}: ${value?.count} cases, avg ${value?.average_latency_ms}ms, statuses ${JSON.stringify(value?.status_counts)}`,
    );
  }
  console.log("");
  console.log(
    `safety: database_writes=${report.safety.database_writes}, event_writes=${report.safety.event_writes}, raw_utterances_in_report=${report.safety.raw_utterances_in_report}`,
  );
}

const report = evaluatePipelineCases(pipelineEvaluationFixtures);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printSummary(report);
}
