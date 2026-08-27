import { describe, expect, it } from "vitest";
import {
  annotationQueueQuery,
  buildAnnotationQueueItems,
  parseAnnotationQueueQuery,
} from "../src/annotations/queue";

describe("parseAnnotationQueueQuery", () => {
  it("applies defaults", () => {
    expect(parseAnnotationQueueQuery({})).toEqual({
      type: "correction",
      limit: 25,
    });
  });

  it("parses the requested type and limit", () => {
    expect(
      parseAnnotationQueueQuery({
        type: "correction",
        limit: "5",
      }),
    ).toEqual({
      type: "correction",
      limit: 5,
    });
  });
});

describe("buildAnnotationQueueItems", () => {
  it("maps corrected inferences into queue items", () => {
    const [item] = buildAnnotationQueueItems("correction", [
      {
        inference_id: "00000000-0000-4000-8000-000000000001",
        text: "Put 12 eggs on the list",
        predicted_interpretation: JSON.stringify({
          intent: "add_item",
          slots: {
            item_name: "eggs on the list",
            quantity: 12,
            location: "fridge",
          },
          confidence: 0.94,
          requires_confirmation: false,
          raw_utterance: "Put 12 eggs on the list",
        }),
        corrected_interpretation: JSON.stringify({
          intent: "add_to_buy",
          slots: {
            item_name: "egg",
            quantity: 12,
          },
          confidence: 0.94,
          requires_confirmation: false,
          raw_utterance: "Put 12 eggs on the list",
        }),
        parser_version: "rules-v1",
        outcome: "corrected",
        created_at: "2026-08-27T00:00:00.000Z",
      },
    ]);

    expect(item).toMatchObject({
      inference_id: "00000000-0000-4000-8000-000000000001",
      queue_type: "correction",
      queue_reason: "corrected_prediction",
      outcome: "corrected",
      reviewed_interpretation: {
        intent: "add_to_buy",
      },
    });
  });
});

describe("annotationQueueQuery", () => {
  it("includes natural-date signals in the expiry queue", () => {
    const expiryQueue = annotationQueueQuery("expiry");

    expect(expiryQueue.reason).toBe("expiry_phrase_detected");
    expect(expiryQueue.query).toContain("august");
    expect(expiryQueue.query).toContain("best by");
    expect(expiryQueue.query).toContain("next friday");
  });

  it("prioritizes low-confidence and ambiguous predictions", () => {
    const queue = annotationQueueQuery("low_confidence");

    expect(queue.reason).toBe("low_confidence_or_ambiguous_intent");
    expect(queue.query).toContain("$.confidence");
    expect(queue.query).toContain("needs_clarification");
    expect(queue.query).toContain("unknown");
  });

  it("returns confirmed but still-unannotated examples", () => {
    const queue = annotationQueueQuery("confirmed_unannotated");

    expect(queue.reason).toBe("confirmed_prediction");
    expect(queue.query).toContain("il.outcome = 'confirmed'");
    expect(queue.query).toContain("il.corrected_interpretation IS NOT NULL");
    expect(queue.query).toContain("il.source != 'annotation-queue-seed-v1'");
    expect(queue.query).toContain("il.source NOT LIKE 'generated-review:%'");
  });

  it("uses a deterministic slice of reviewed traffic for evaluation holdout", () => {
    const queue = annotationQueueQuery("evaluation_holdout");

    expect(queue.reason).toBe("deterministic_holdout_bucket");
    expect(queue.query).toContain("il.outcome IN ('confirmed', 'corrected')");
    expect(queue.query).toContain("substr(replace(il.id, '-', ''), 1, 1) IN ('0', '1', '2')");
    expect(queue.query).toContain("il.source != 'annotation-queue-seed-v1'");
  });

  it("exposes generated review records through a dedicated queue", () => {
    const queue = annotationQueueQuery("generated_review");

    expect(queue.reason).toBe("generated_dataset_record");
    expect(queue.query).toContain("il.source LIKE 'generated-review:%'");
    expect(queue.query).toContain("il.corrected_interpretation IS NOT NULL");
  });
});
