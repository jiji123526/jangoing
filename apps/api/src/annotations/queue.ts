import {
  AnnotationQueueItemSchema,
  AnnotationQueueQuerySchema,
  type AnnotationQueueItem,
  type AnnotationQueueQuery,
  type AnnotationQueueType,
  type Interpretation,
} from "@jangoing/contracts";

export interface AnnotationQueueRow {
  inference_id: string;
  text: string;
  predicted_interpretation: string;
  corrected_interpretation: string | null;
  parser_version: string;
  outcome: string;
  created_at: string;
}

interface QueueDefinition {
  query: string;
  reason: string;
}

export function parseAnnotationQueueQuery(
  input: Record<string, string | undefined>,
): AnnotationQueueQuery {
  return AnnotationQueueQuerySchema.parse(input);
}

function queueDefinition(type: AnnotationQueueType): QueueDefinition {
  switch (type) {
    case "correction":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.parser_version,
          il.outcome,
          COALESCE(il.resolved_at, il.created_at) AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND il.outcome = 'corrected'
          AND il.corrected_interpretation IS NOT NULL
        ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
        LIMIT ?`,
        reason: "corrected_prediction",
      };
    default:
      throw new Error(`Queue type is not implemented yet: ${type}`);
  }
}

function asInterpretation(
  payload: string | null,
  rawUtterance: string,
): Interpretation | undefined {
  if (!payload) {
    return undefined;
  }

  const parsed = JSON.parse(payload) as Partial<Interpretation> & {
    intent?: Interpretation["intent"];
    slots?: Interpretation["slots"];
  };

  if (
    parsed.intent &&
    parsed.slots &&
    typeof parsed.confidence === "number" &&
    typeof parsed.requires_confirmation === "boolean" &&
    typeof parsed.raw_utterance === "string"
  ) {
    return parsed as Interpretation;
  }

  if (!parsed.intent || !parsed.slots) {
    return undefined;
  }

  return {
    intent: parsed.intent,
    slots: parsed.slots,
    confidence: 1,
    requires_confirmation: false,
    raw_utterance: rawUtterance,
  };
}

export function buildAnnotationQueueItems(
  type: AnnotationQueueType,
  rows: AnnotationQueueRow[],
): AnnotationQueueItem[] {
  const definition = queueDefinition(type);

  return rows.map((row) =>
    AnnotationQueueItemSchema.parse({
      inference_id: row.inference_id,
      text: row.text,
      queue_type: type,
      queue_reason: definition.reason,
      predicted_interpretation: asInterpretation(row.predicted_interpretation, row.text),
      reviewed_interpretation: asInterpretation(row.corrected_interpretation, row.text),
      outcome: row.outcome,
      parser_version: row.parser_version,
      created_at: row.created_at,
    }),
  );
}

export function annotationQueueQuery(
  type: AnnotationQueueType,
): QueueDefinition {
  return queueDefinition(type);
}
