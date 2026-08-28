import { createHash } from "node:crypto";
import {
  ActivationModeSchema,
  RelevanceSchema,
  SpeakerRoleSchema,
  type ActivationMode,
  type Relevance,
  type SpeakerRole,
} from "@jangoing/contracts";

export type DatasetPurpose = "train_candidate" | "evaluation_candidate";
export type DatasetExportTask = "relevance" | "intent" | "slots" | "joint";
export type ExportRow = Record<string, string | null>;

export interface DatasetExportOptions {
  remote: boolean;
  trainOutput: string;
  evaluationOutput: string;
  task: DatasetExportTask;
  requireAnnotation: boolean;
}

export interface DatasetRecord {
  id: string;
  text: string;
  relevance: Relevance;
  intents: string[];
  actions: Array<Record<string, unknown> & { intent: string }>;
  predicted: unknown;
  outcome: string | null;
  parser_version: string | null;
  dataset_purpose: DatasetPurpose;
  phrase_family: string;
  annotation_schema_version: string | null;
  reviewed_at: string | null;
  has_annotation: boolean;
  reference_date?: string;
  timezone?: string;
  conversation_id?: string;
  turn_index?: number;
  speaker_role?: SpeakerRole;
  activation_mode?: ActivationMode;
  intent?: string;
  slots?: unknown;
  entities?: unknown;
}

interface RequestContextPayload {
  expiration_date?: string | null;
  reference_date?: string | null;
  timezone?: string | null;
  conversation_id?: string | null;
  turn_index?: number | null;
  speaker_role?: string | null;
  activation_mode?: string | null;
}

function parseDatasetExportTask(value: string): DatasetExportTask {
  switch (value) {
    case "relevance":
    case "intent":
    case "slots":
    case "joint":
      return value;
    default:
      throw new Error(`Unknown --task value: ${value}. Use relevance, intent, slots, or joint.`);
  }
}

export function parseDatasetExportArgs(args: string[]): DatasetExportOptions {
  let remote = false;
  let trainOutput: string | undefined;
  let evaluationOutput: string | undefined;
  let task: DatasetExportTask = "intent";
  let requireAnnotation = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--remote") {
      remote = true;
      continue;
    }
    if (argument === "--require-annotation") {
      requireAnnotation = true;
      continue;
    }
    if (argument === "--output") {
      throw new Error(
        "--output is no longer supported because it mixes training and evaluation data. " +
          "Use --train-output and --evaluation-output.",
      );
    }
    if (argument === "--task") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--task requires one of: relevance, intent, slots, joint");
      }
      task = parseDatasetExportTask(value);
      index += 1;
      continue;
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

  if (task === "relevance" || task === "slots" || task === "joint") {
    requireAnnotation = true;
  }

  return { remote, trainOutput, evaluationOutput, task, requireAnnotation };
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
    const requestContext = row.request_context
      ? parseJson<RequestContextPayload>(
          row.request_context,
          row.id ?? "<unknown>",
          "request_context",
        )
      : null;
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

    if (!row.predicted_interpretation || !row.raw_utterance || !row.id) {
      continue;
    }
    const relevance = RelevanceSchema.parse(row.annotation_relevance ?? "actionable");
    const exportedActions = relevance === "actionable" ? annotationActions : [];
    if (relevance === "actionable" && exportedActions.length === 0) {
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
    const isSingleAction = exportedActions.length === 1;
    const phraseFamily = exportedActions.length === 0
      ? String(row.annotation_phrase_family ?? generatedPhraseFamily)
      : isSingleAction
        ? String(exportedActions[0].phrase_family ?? generatedPhraseFamily)
        : `multi:${exportedActions.map((action) => action.phrase_family ?? action.intent).join("+")}`;

    records.push({
      id: row.id,
      text: row.raw_utterance,
      relevance,
      intents: exportedActions.map((action) => action.intent),
      actions: exportedActions,
      ...(isSingleAction ? {
        intent: exportedActions[0].intent,
        slots: exportedActions[0].normalized ?? {},
        entities: exportedActions[0].entities ?? [],
      } : {}),
      predicted: parseJson(row.predicted_interpretation, row.id, "predicted_interpretation"),
      outcome: row.outcome,
      parser_version: row.parser_version,
      dataset_purpose: purpose,
      phrase_family: phraseFamily,
      annotation_schema_version: row.annotation_schema_version,
      reviewed_at: row.annotation_created_at ?? row.created_at,
      has_annotation: row.annotation_created_at !== null,
      ...(requestContext?.reference_date ? { reference_date: requestContext.reference_date } : {}),
      ...(requestContext?.timezone ? { timezone: requestContext.timezone } : {}),
      ...(requestContext?.conversation_id ? { conversation_id: requestContext.conversation_id } : {}),
      ...(typeof requestContext?.turn_index === "number"
        ? { turn_index: requestContext.turn_index }
        : {}),
      ...(requestContext?.speaker_role
        ? { speaker_role: SpeakerRoleSchema.parse(requestContext.speaker_role) }
        : {}),
      ...(requestContext?.activation_mode
        ? { activation_mode: ActivationModeSchema.parse(requestContext.activation_mode) }
        : {}),
    });
  }

  return records;
}

export function filterDatasetRecords(
  records: DatasetRecord[],
  options: Pick<DatasetExportOptions, "task" | "requireAnnotation">,
): DatasetRecord[] {
  return records.filter((record) => {
    if (options.requireAnnotation && !record.has_annotation) {
      return false;
    }

    if (options.task === "relevance") {
      return record.has_annotation;
    }

    if (record.relevance !== "actionable") {
      return false;
    }

    if (options.task === "slots" || options.task === "joint") {
      return record.has_annotation;
    }

    return true;
  });
}

function normalizedText(text: string): string {
  return text.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function recordPhraseFamilies(record: DatasetRecord): string[] {
  if (record.actions.length === 0) {
    return [];
  }

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
