import { describe, expect, it } from "vitest";
import {
  buildDatasetRecords,
  filterDatasetRecords,
  parseDatasetExportArgs,
  splitAndValidateDataset,
  type DatasetRecord,
} from "../src/dataset-export";

function record(
  id: string,
  purpose: DatasetRecord["dataset_purpose"],
  text: string,
  phraseFamily: string,
  overrides: Partial<DatasetRecord> = {},
): DatasetRecord {
  return {
    id,
    text,
    intents: ["add_to_buy"],
    actions: [{ intent: "add_to_buy", phrase_family: phraseFamily }],
    intent: "add_to_buy",
    slots: {},
    entities: [],
    predicted: {},
    outcome: "confirmed",
    parser_version: "test",
    dataset_purpose: purpose,
    phrase_family: phraseFamily,
    annotation_schema_version: "annotation-v2",
    reviewed_at: "2026-08-27T00:00:00.000Z",
    has_annotation: true,
    ...overrides,
  };
}

describe("parseDatasetExportArgs", () => {
  it("requires separate training and evaluation outputs", () => {
    expect(parseDatasetExportArgs([
      "--remote",
      "--train-output",
      "ml/data/train.jsonl",
      "--evaluation-output",
      "ml/data/evaluation.jsonl",
    ])).toEqual({
      remote: true,
      trainOutput: "ml/data/train.jsonl",
      evaluationOutput: "ml/data/evaluation.jsonl",
      task: "intent",
      requireAnnotation: false,
    });
  });

  it("rejects the legacy mixed output option", () => {
    expect(() => parseDatasetExportArgs(["--output", "ml/data/reviewed.jsonl"]))
      .toThrow("--output is no longer supported");
  });

  it("enables annotation-only filtering for slot exports", () => {
    expect(parseDatasetExportArgs([
      "--task",
      "slots",
      "--train-output",
      "ml/data/train.jsonl",
      "--evaluation-output",
      "ml/data/evaluation.jsonl",
    ])).toEqual({
      remote: false,
      trainOutput: "ml/data/train.jsonl",
      evaluationOutput: "ml/data/evaluation.jsonl",
      task: "slots",
      requireAnnotation: true,
    });
  });
});

describe("splitAndValidateDataset", () => {
  it("separates records by dataset purpose", () => {
    const training = record("train-1", "train_candidate", "Add milk", "explicit_add");
    const evaluation = record("eval-1", "evaluation_candidate", "Milk would be useful", "indirect_add");

    expect(splitAndValidateDataset([training, evaluation])).toEqual({
      training: [training],
      evaluation: [evaluation],
    });
  });

  it("rejects duplicate ids", () => {
    expect(() => splitAndValidateDataset([
      record("same", "train_candidate", "Add milk", "explicit_add"),
      record("same", "train_candidate", "Add eggs", "explicit_add"),
    ])).toThrow("Duplicate dataset record id: same");
  });

  it("rejects phrase-family leakage across splits", () => {
    expect(() => splitAndValidateDataset([
      record("train-1", "train_candidate", "Add milk", "explicit_add"),
      record("eval-1", "evaluation_candidate", "Add eggs", "explicit_add"),
    ])).toThrow('Dataset leakage: phrase family "explicit_add"');
  });

  it("rejects normalized text leakage across splits", () => {
    expect(() => splitAndValidateDataset([
      record("train-1", "train_candidate", " Add   Milk ", "explicit_add"),
      record("eval-1", "evaluation_candidate", "add milk", "indirect_add"),
    ])).toThrow('Dataset leakage: text "add milk"');
  });
});

describe("filterDatasetRecords", () => {
  it("keeps reviewed corrected records for intent export by default", () => {
    const correctedOnly = record(
      "reviewed-1",
      "train_candidate",
      "Add milk",
      "explicit_add",
      {
        has_annotation: false,
        annotation_schema_version: null,
        reviewed_at: "2026-08-27T00:00:00.000Z",
      },
    );

    expect(filterDatasetRecords([correctedOnly], {
      task: "intent",
      requireAnnotation: false,
    })).toEqual([correctedOnly]);
  });

  it("drops unannotated reviewed records for slot export", () => {
    const correctedOnly = record(
      "reviewed-1",
      "train_candidate",
      "Add milk",
      "explicit_add",
      {
        has_annotation: false,
        annotation_schema_version: null,
      },
    );
    const annotated = record("annotated-1", "train_candidate", "Add eggs", "explicit_add");

    expect(filterDatasetRecords([correctedOnly, annotated], {
      task: "slots",
      requireAnnotation: true,
    })).toEqual([annotated]);
  });

  it("supports explicit annotation-only filtering for intent export", () => {
    const correctedOnly = record(
      "reviewed-1",
      "train_candidate",
      "Add milk",
      "explicit_add",
      {
        has_annotation: false,
        annotation_schema_version: null,
      },
    );
    const annotated = record("annotated-1", "train_candidate", "Add eggs", "indirect_add");

    expect(filterDatasetRecords([correctedOnly, annotated], {
      task: "intent",
      requireAnnotation: true,
    })).toEqual([annotated]);
  });
});

describe("buildDatasetRecords", () => {
  it("includes reference date and timezone from request context", () => {
    const [record] = buildDatasetRecords([
      {
        id: "record-1",
        raw_utterance: "Add milk expiring tomorrow",
        predicted_interpretation: JSON.stringify({
          intent: "add_item",
          slots: {
            item_name: "milk",
            expiration_date: "2026-08-27",
          },
          confidence: 0.94,
          requires_confirmation: false,
          raw_utterance: "Add milk expiring tomorrow",
        }),
        corrected_interpretation: JSON.stringify({
          intent: "add_item",
          slots: {
            item_name: "milk",
            expiration_date: "2026-08-27",
          },
        }),
        request_context: JSON.stringify({
          reference_date: "2026-08-26",
          timezone: "America/New_York",
        }),
        parser_version: "rules-v1",
        outcome: "confirmed",
        created_at: "2026-08-27T00:00:00.000Z",
        annotation_intent: null,
        annotation_entities: null,
        annotation_normalized: null,
        dataset_purpose: "train_candidate",
        annotation_phrase_family: null,
        annotation_actions: null,
        annotation_schema_version: null,
        annotation_created_at: null,
      },
    ]);

    expect(record).toMatchObject({
      reference_date: "2026-08-26",
      timezone: "America/New_York",
    });
  });
});
