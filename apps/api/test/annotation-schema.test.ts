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

  it("accepts item-condition entities when they carry a normalized value", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_to_buy",
        phrase_family: "purchase_request",
        entities: [
          { label: "ITEM_CONDITION", start: 4, end: 10, text: "frozen", normalized_value: "frozen" },
          { label: "ITEM", start: 11, end: 22, text: "blueberries", normalized_value: "blueberry" },
        ],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing normalized values for item-condition entities", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "throw_away",
        phrase_family: "spoiled_item_discard",
        entities: [
          { label: "ITEM_CONDITION", start: 16, end: 23, text: "spoiled" },
          { label: "ITEM", start: 24, end: 28, text: "milk", normalized_value: "milk" },
        ],
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

  it("accepts update-expiry actions with expiry-specific phrase families", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "update_expiry",
        phrase_family: "explicit_set_expiry",
        entities: [
          { label: "ITEM", start: 4, end: 8, text: "milk", normalized_value: "milk" },
          {
            label: "EXPIRY_DATE",
            start: 20,
            end: 30,
            text: "next Friday",
            normalized_value: "2026-09-04",
          },
        ],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(true);
  });

  it("accepts mark-out actions with out-of-stock phrase families", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "mark_out",
        phrase_family: "state_out_of_entity",
        entities: [{ label: "ITEM", start: 12, end: 16, text: "milk", normalized_value: "milk" }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
    });

    expect(result.success).toBe(true);
  });

  it("requires assistant resolution when a proposal id is provided", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{ label: "ITEM", start: 4, end: 8, text: "milk", normalized_value: "milk" }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
      assistant_proposal_id: "00000000-0000-4000-8000-000000000002",
    });

    expect(result.success).toBe(false);
  });

  it("accepts assistant proposal linkage with a resolution", () => {
    const result = CreateAnnotationRequestSchema.safeParse({
      inference_id: inferenceId,
      actions: [{
        intent: "add_item",
        phrase_family: "explicit_add_to_inventory",
        entities: [{ label: "ITEM", start: 4, end: 8, text: "milk", normalized_value: "milk" }],
      }],
      dataset_purpose: "train_candidate",
      annotator: "test",
      assistant_proposal_id: "00000000-0000-4000-8000-000000000002",
      assistant_resolution: "accepted_with_edits",
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
