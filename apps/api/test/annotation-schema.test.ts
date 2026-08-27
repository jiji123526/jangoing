import { AnnotationStatsSchema, CreateAnnotationRequestSchema } from "@jangoing/contracts";
import { describe, expect, it } from "vitest";

const inferenceId = "00000000-0000-4000-8000-000000000001";

describe("CreateAnnotationRequestSchema", () => {
  it("accepts multiple action groups with action-specific entities", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [
        {
          intent: "add_to_buy",
          phrase_family: "explicit_add_to_list",
          entities: [{ label: "ITEM", start: 4, end: 8, text: "milk", normalized_value: "milk" }],
        },
        {
          intent: "throw_away",
          phrase_family: "explicit_discard_request",
          entities: [{ label: "ITEM", start: 36, end: 43, text: "spinach", normalized_value: "spinach" }],
        },
      ],
      dataset_purpose: "evaluation_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a phrase family that belongs to another intent", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "throw_away",
        phrase_family: "explicit_add_to_list",
        entities: [],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing normalized values for reviewed item-style labels", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{ label: "ITEM", start: 4, end: 8, text: "milk" }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(false);
  });

  it("requires an ISO-like string normalized value for expiry-date entities", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{
          label: "EXPIRY_DATE",
          start: 18,
          end: 26,
          text: "tomorrow",
          normalized_value: 1,
        }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-ISO expiry-date normalized strings", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{
          label: "EXPIRY_DATE",
          start: 18,
          end: 26,
          text: "tomorrow",
          normalized_value: "tomorrow",
        }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(false);
  });

  it("still allows quantity entities without normalized values", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "consume_item",
        phrase_family: "quantity_consumed",
        entities: [{ label: "QUANTITY", start: 7, end: 10, text: "two" }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(true);
  });
});

describe("AnnotationStatsSchema", () => {
  it("accepts purpose-specific annotation counts", () => {
    expect(AnnotationStatsSchema.parse({
      annotated: 12,
      train_candidates: 7,
      evaluation_candidates: 5,
    })).toEqual({ annotated: 12, train_candidates: 7, evaluation_candidates: 5 });
  });
});
