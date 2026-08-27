import { createHash } from "node:crypto";

export type DatasetPurpose = "train_candidate" | "evaluation_candidate";
export type ExportRow = Record<string, string | null>;

export interface DatasetExportOptions {
  remote: boolean;
  trainOutput: string;
  evaluationOutput: string;
}

export interface DatasetRecord {
  id: string;
  text: string;
  intents: string[];
  actions: Array<Record<string, unknown> & { intent: string }>;
  predicted: unknown;
  outcome: string | null;
  parser_version: string | null;
  dataset_purpose: DatasetPurpose;
  phrase_family: string;
  annotation_schema_version: string | null;
  reviewed_at: string | null;
  intent?: string;
  slots?: unknown;
  entities?: unknown;
}

export function parseDatasetExportArgs(args: string[]): DatasetExportOptions {
  let remote = false;
  let trainOutput: string | undefined;
  let evaluationOutput: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--remote") {
      remote = true;
      continue;
    }
    if (argument === "--output") {
      throw new Error(
        "--output is no longer supported because it mixes training and evaluation data. " +
          "Use --train-output and --evaluation-output.",
      );
    }
    if (argument === "--train-output" || argument === "--evaluation-output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a file path`);
      }
      if (argument === "--train-output") {
        if (trainOutput) throw new Error("--train-output may only be specified once");
        trainOutput = value;
      } else {
        if (evaluationOutput) throw new Error("--evaluation-output may only be specified once");
        evaluationOutput = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!trainOutput || !evaluationOutput) {
    throw new Error("--train-output and --evaluation-output are both required");
  }
  if (trainOutput === evaluationOutput) {
    throw new Error("Training and evaluation outputs must be different files");
  }

  return { remote, trainOutput, evaluationOutput };
}

function parseJson<T>(value: string, rowId: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Record ${rowId} has invalid JSON in ${field}`);
  }
}

export function buildDatasetRecords(rows: ExportRow[]): DatasetRecord[] {
  const records: DatasetRecord[] = [];

  for (const row of rows) {
    const correctedPayload = row.corrected_interpretation
      ? parseJson<{
          intent: string;
          slots?: Record<string, unknown>;
          actions?: Array<Record<string, unknown> & { intent: string }>;
        }>(row.corrected_interpretation, row.id ?? "<unknown>", "corrected_interpretation")
      : null;
    const annotationActions = row.annotation_actions
      ? parseJson<Array<Record<string, unknown> & { intent: string }>>(
          row.annotation_actions,
          row.id ?? "<unknown>",
          "annotation_actions",
        )
      : row.annotation_intent
        ? [{
            intent: row.annotation_intent,
            entities: row.annotation_entities
              ? parseJson(row.annotation_entities, row.id ?? "<unknown>", "annotation_entities")
              : [],
            normalized: row.annotation_normalized
              ? parseJson(row.annotation_normalized, row.id ?? "<unknown>", "annotation_normalized")
              : {},
            phrase_family: row.annotation_phrase_family,
          }]
        : correctedPayload?.actions ?? (correctedPayload?.intent
          ? [{ intent: correctedPayload.intent, normalized: correctedPayload.slots ?? {}, entities: [] }]
          : []);

    if (!annotationActions.length || !row.predicted_interpretation || !row.raw_utterance || !row.id) {
      continue;
    }

    const purpose = row.dataset_purpose ?? "train_candidate";
    if (purpose !== "train_candidate" && purpose !== "evaluation_candidate") {
      throw new Error(`Record ${row.id} has unknown dataset purpose: ${purpose}`);
    }

    const generatedPhraseFamily = createHash("sha256")
      .update(row.raw_utterance.toLowerCase().replace(/[a-z0-9]+/g, "_"))
      .digest("hex")
      .slice(0, 12);
    const isSingleAction = annotationActions.length === 1;
    const phraseFamily = isSingleAction
      ? String(annotationActions[0].phrase_family ?? generatedPhraseFamily)
      : `multi:${annotationActions.map((action) => action.phrase_family ?? action.intent).join("+")}`;

    records.push({
      id: row.id,
      text: row.raw_utterance,
      intents: annotationActions.map((action) => action.intent),
      actions: annotationActions,
      ...(isSingleAction ? {
        intent: annotationActions[0].intent,
        slots: annotationActions[0].normalized ?? {},
        entities: annotationActions[0].entities ?? [],
      } : {}),
      predicted: parseJson(row.predicted_interpretation, row.id, "predicted_interpretation"),
      outcome: row.outcome,
      parser_version: row.parser_version,
      dataset_purpose: purpose,
      phrase_family: phraseFamily,
      annotation_schema_version: row.annotation_schema_version,
      reviewed_at: row.annotation_created_at ?? row.created_at,
    });
  }

  return records;
}

function normalizedText(text: string): string {
  return text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function recordPhraseFamilies(record: DatasetRecord): string[] {
  const actionFamilies = record.actions
    .map((action) => action.phrase_family)
    .filter((family): family is string => typeof family === "string" && family.length > 0);
  return actionFamilies.length ? actionFamilies : [record.phrase_family];
}

export function splitAndValidateDataset(records: DatasetRecord[]): {
  training: DatasetRecord[];
  evaluation: DatasetRecord[];
} {
  const ids = new Set<string>();
  const ownership = new Map<string, { purpose: DatasetPurpose; id: string }>();
  const training: DatasetRecord[] = [];
  const evaluation: DatasetRecord[] = [];

  for (const record of records) {
    if (ids.has(record.id)) {
      throw new Error(`Duplicate dataset record id: ${record.id}`);
    }
    ids.add(record.id);

    const leakageKeys = [
      ...recordPhraseFamilies(record).map((family) => `phrase family "${family}"`),
      `text "${normalizedText(record.text)}"`,
    ];
    for (const key of leakageKeys) {
      const owner = ownership.get(key);
      if (owner && owner.purpose !== record.dataset_purpose) {
        throw new Error(
          `Dataset leakage: ${key} is shared by ${owner.id} (${owner.purpose}) ` +
            `and ${record.id} (${record.dataset_purpose})`,
        );
      }
      ownership.set(key, { purpose: record.dataset_purpose, id: record.id });
    }

    if (record.dataset_purpose === "train_candidate") {
      training.push(record);
    } else {
      evaluation.push(record);
    }
  }

  return { training, evaluation };
}

export function serializeJsonl(records: DatasetRecord[]): string {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}
