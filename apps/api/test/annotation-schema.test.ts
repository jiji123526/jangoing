import { CreateAnnotationRequestSchema } from "@jangoing/contracts";
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
});
