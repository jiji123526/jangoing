import { describe, expect, it } from "vitest";
import {
  parseDatasetExportArgs,
  splitAndValidateDataset,
  type DatasetRecord,
} from "../src/dataset-export";

function record(
  id: string,
  purpose: DatasetRecord["dataset_purpose"],
  text: string,
  phraseFamily: string,
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
    });
  });

  it("rejects the legacy mixed output option", () => {
    expect(() => parseDatasetExportArgs(["--output", "ml/data/reviewed.jsonl"]))
      .toThrow("--output is no longer supported");
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
