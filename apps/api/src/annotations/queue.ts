import {
  AnnotationQueueItemSchema,
  AnnotationQueueQuerySchema,
  RelevanceSchema,
  type AnnotationQueueItem,
  type AnnotationQueueQuery,
  type AnnotationQueueType,
  type Interpretation,
} from "@jangoing/contracts";
import { annotationQueueSeedSourcePrefix } from "./queue-seed";
import { generatedReviewSourcePrefix } from "./generated-review";
import {
  extractInlineExpiry,
  normalizeExpiryDate,
  resolveStoredTemporalGrounding,
} from "../nlp/temporal-grounding";

export interface AnnotationQueueRow {
  inference_id: string;
  text: string;
  predicted_interpretation: string;
  corrected_interpretation: string | null;
  request_context: string | null;
  parser_version: string;
  outcome: string;
  created_at: string;
}

interface QueueDefinition {
  query: string;
  reason: string;
}

const expirySignals = [
  "expire",
  "expiry",
  "expiring",
  "expires",
  "use by",
  "best by",
  "tomorrow",
  "next friday",
  "next saturday",
  "next sunday",
  "next monday",
  "next tuesday",
  "next wednesday",
  "next thursday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const generatedReviewSourceLike = `${generatedReviewSourcePrefix}%`;
const actualUserSourceFilter =
  `il.source NOT LIKE '${annotationQueueSeedSourcePrefix}%' AND il.source NOT LIKE '${generatedReviewSourceLike}'`;
const nonGeneratedReviewFilter = `il.source NOT LIKE '${generatedReviewSourceLike}'`;
const candidateRelevance = "json_extract(il.request_context, '$.candidate_relevance')";

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
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND ${actualUserSourceFilter}
          AND il.outcome = 'corrected'
          AND il.corrected_interpretation IS NOT NULL
        ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
        LIMIT ?`,
        reason: "corrected_prediction",
      };
    case "expiry":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND ${nonGeneratedReviewFilter}
          AND (${expirySignals
            .map((signal) => `LOWER(il.raw_utterance) LIKE '%${signal.replaceAll("'", "''")}%'`)
            .join(" OR ")})
        ORDER BY
          CASE il.outcome
            WHEN 'corrected' THEN 0
            WHEN 'confirmed' THEN 1
            WHEN 'pending' THEN 2
            ELSE 3
          END,
          COALESCE(il.resolved_at, il.created_at) ASC,
          il.id ASC
        LIMIT ?`,
        reason: "expiry_phrase_detected",
      };
    case "low_confidence":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND ${nonGeneratedReviewFilter}
          AND (
            json_extract(il.predicted_interpretation, '$.confidence') < 0.85
            OR json_extract(il.predicted_interpretation, '$.intent') IN ('unknown', 'needs_clarification')
          )
        ORDER BY
          CASE json_extract(il.predicted_interpretation, '$.intent')
            WHEN 'needs_clarification' THEN 0
            WHEN 'unknown' THEN 1
            ELSE 2
          END,
          json_extract(il.predicted_interpretation, '$.confidence') ASC,
          COALESCE(il.resolved_at, il.created_at) ASC,
          il.id ASC
        LIMIT ?`,
        reason: "low_confidence_or_ambiguous_intent",
      };
    case "confirmed_unannotated":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND ${actualUserSourceFilter}
          AND il.outcome = 'confirmed'
          AND il.corrected_interpretation IS NOT NULL
        ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
        LIMIT ?`,
        reason: "confirmed_prediction",
      };
    case "evaluation_holdout":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND ${actualUserSourceFilter}
          AND il.outcome IN ('confirmed', 'corrected')
          AND il.corrected_interpretation IS NOT NULL
          AND substr(replace(il.id, '-', ''), 1, 1) IN ('0', '1', '2')
        ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
        LIMIT ?`,
        reason: "deterministic_holdout_bucket",
      };
    case "generated_review":
      return {
        query: `SELECT
          il.id AS inference_id,
          il.raw_utterance AS text,
          il.predicted_interpretation,
          il.corrected_interpretation,
          il.request_context,
          il.parser_version,
          il.outcome,
          il.created_at AS created_at
        FROM inference_logs il
        LEFT JOIN annotations a ON a.inference_id = il.id
        WHERE
          a.id IS NULL
          AND il.source LIKE '${generatedReviewSourceLike}'
          AND il.corrected_interpretation IS NOT NULL
          AND ${candidateRelevance} IS NULL
        ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
        LIMIT ?`,
        reason: "generated_dataset_record",
      };
    case "preference_context":
      return relevanceQueueDefinition(
        "contextual_preference",
        "generated_context_or_preference_candidate",
      );
    case "domain_non_actionable":
      return relevanceQueueDefinition(
        "domain_non_actionable",
        "generated_domain_non_actionable_candidate",
      );
    case "unrelated_negative":
      return relevanceQueueDefinition(
        "unrelated",
        "generated_unrelated_negative_candidate",
      );
    default:
      throw new Error(`Queue type is not implemented yet: ${type}`);
  }
}

function relevanceQueueDefinition(relevance: string, reason: string): QueueDefinition {
  return {
    query: `SELECT
      il.id AS inference_id,
      il.raw_utterance AS text,
      il.predicted_interpretation,
      il.corrected_interpretation,
      il.request_context,
      il.parser_version,
      il.outcome,
      il.created_at AS created_at
    FROM inference_logs il
    LEFT JOIN annotations a ON a.inference_id = il.id
    WHERE
      a.id IS NULL
      AND il.source LIKE '${generatedReviewSourceLike}'
      AND ${candidateRelevance} = '${relevance}'
    ORDER BY COALESCE(il.resolved_at, il.created_at) ASC, il.id ASC
    LIMIT ?`,
    reason,
  };
}

function candidateRelevanceFromContext(
  requestContext: string | null,
): ReturnType<typeof RelevanceSchema.parse> | undefined {
  if (!requestContext) {
    return undefined;
  }

  try {
    const context = JSON.parse(requestContext) as Record<string, unknown>;
    const parsed = RelevanceSchema.safeParse(context.candidate_relevance);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
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

  return rows.map((row) => {
    const temporalContext = resolveStoredTemporalGrounding(
      row.request_context,
      row.created_at,
    );
    const expiryText = extractInlineExpiry(row.text).expirationDateText;
    const normalizedExpirySuggestion = normalizeExpiryDate(
      expiryText,
      temporalContext,
    );

    return AnnotationQueueItemSchema.parse({
      inference_id: row.inference_id,
      text: row.text,
      queue_type: type,
      queue_reason: definition.reason,
      suggested_relevance: candidateRelevanceFromContext(row.request_context),
      predicted_interpretation: asInterpretation(row.predicted_interpretation, row.text),
      reviewed_interpretation: asInterpretation(row.corrected_interpretation, row.text),
      outcome: row.outcome,
      parser_version: row.parser_version,
      created_at: row.created_at,
      temporal_context: {
        ...temporalContext,
        inference_created_at: row.created_at,
        ...(normalizedExpirySuggestion
          ? { normalized_expiry_suggestion: normalizedExpirySuggestion }
          : {}),
      },
    });
  });
}

export function annotationQueueQuery(
  type: AnnotationQueueType,
): QueueDefinition {
  return queueDefinition(type);
}
