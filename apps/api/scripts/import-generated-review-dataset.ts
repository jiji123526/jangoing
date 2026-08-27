import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { IntentSchema, type Interpretation, type Intent } from "@jangoing/contracts";
import { annotationQueueQuery } from "../src/annotations/queue";
import {
  generatedReviewInterpretation,
  generatedReviewNormalizerVersion,
  generatedReviewParserVersion,
  generatedReviewReferenceDate,
  generatedReviewSchemaVersion,
  generatedReviewSource,
  generatedReviewTimezone,
  type GeneratedDatasetRecord,
} from "../src/annotations/generated-review";
import { parseCommand } from "../src/nlp/parse-command";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiDirectory, "../..");
const localDatabasePath =
  process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
const defaultInput = resolve(repositoryRoot, "ml/datasets/synthetic-v1.jsonl");
const migrationPaths = [
  resolve(apiDirectory, "migrations/0001_create_events.sql"),
  resolve(apiDirectory, "migrations/0002_create_corrections.sql"),
  resolve(apiDirectory, "migrations/0003_create_inference_logs.sql"),
  resolve(apiDirectory, "migrations/0004_create_annotations.sql"),
];
const annotationActionsMigrationPath = resolve(
  apiDirectory,
  "migrations/0005_add_annotation_actions.sql",
);

interface ImportOptions {
  input: string;
  label: string;
  limit?: number;
  remote: boolean;
}

interface ImportedInferenceLogRecord {
  id: string;
  raw_utterance: string;
  request_context: string;
  predicted_interpretation: string;
  corrected_interpretation: string;
  parser_version: string;
  normalizer_version: string;
  schema_version: string;
  source: string;
  outcome: "confirmed" | "corrected";
  latency_ms: number;
  created_at: string;
  resolved_at: string;
}

function parseArgs(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    input: defaultInput,
    label: "synthetic-v1",
    remote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--remote") {
      options.remote = true;
      continue;
    }

    if (current === "--input" && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (current === "--label" && next) {
      options.label = next;
      index += 1;
      continue;
    }

    if (current === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (!options.label.trim()) {
    throw new Error("--label must be non-empty");
  }

  return options;
}

function migrationSql(path: string, tableName: string): string {
  return readFileSync(path, "utf8")
    .replace(`CREATE TABLE ${tableName}`, `CREATE TABLE IF NOT EXISTS ${tableName}`)
    .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
}

function ensureLocalSchema(database: DatabaseSync): void {
  database.exec(migrationSql(migrationPaths[0], "events"));
  database.exec(migrationSql(migrationPaths[1], "corrections"));
  database.exec(migrationSql(migrationPaths[2], "inference_logs"));
  database.exec(migrationSql(migrationPaths[3], "annotations"));

  const annotationColumns = database.prepare("PRAGMA table_info(annotations)").all() as Array<{ name: string }>;
  if (!annotationColumns.some((column) => column.name === "actions")) {
    database.exec(readFileSync(annotationActionsMigrationPath, "utf8"));
  }
}

function normalizeIntent(value: unknown): Intent {
  const parsed = IntentSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Generated record intent must be a supported intent string");
  }
  return parsed.data;
}

function readGeneratedRecords(inputPath: string, limit?: number): GeneratedDatasetRecord[] {
  const resolvedInput = isAbsolute(inputPath) ? inputPath : resolve(repositoryRoot, inputPath);
  const raw = readFileSync(resolvedInput, "utf8");
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const slice = limit ? lines.slice(0, limit) : lines;

  return slice.map((line) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
      throw new Error("Generated record text must be a non-empty string");
    }

    return {
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      text: parsed.text,
      intent: normalizeIntent(parsed.intent),
      normalized:
        parsed.normalized && typeof parsed.normalized === "object"
          ? (parsed.normalized as Record<string, unknown>)
          : undefined,
      generator_version:
        typeof parsed.generator_version === "string"
          ? parsed.generator_version
          : typeof parsed.source === "string"
          ? parsed.source
          : undefined,
      locale: typeof parsed.locale === "string" ? parsed.locale : undefined,
      difficulty: typeof parsed.difficulty === "string" ? parsed.difficulty : undefined,
      phrase_family: typeof parsed.phrase_family === "string" ? parsed.phrase_family : undefined,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
    };
  });
}

function stableUuid(label: string, key: string): string {
  const hash = createHash("sha256").update(`${label}\0${key}`).digest("hex").slice(0, 32).split("");
  hash[12] = "4";
  hash[16] = ["8", "9", "a", "b"][parseInt(hash[16], 16) % 4];
  const value = hash.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function sameInterpretation(left: Interpretation, right: Interpretation): boolean {
  return JSON.stringify({ intent: left.intent, slots: left.slots }) ===
    JSON.stringify({ intent: right.intent, slots: right.slots });
}

function createdAt(index: number): string {
  return new Date(Date.UTC(2026, 8, 2, 8, index, 0)).toISOString();
}

function importRecord(
  record: GeneratedDatasetRecord,
  label: string,
  index: number,
): ImportedInferenceLogRecord {
  const corrected = generatedReviewInterpretation(record);
  const predicted = parseCommand({
    text: record.text,
    reference_date: generatedReviewReferenceDate,
    timezone: generatedReviewTimezone,
  });
  const timestamp = createdAt(index);
  const key = record.id ?? `${record.text}:${record.intent}:${index}`;

  return {
    id: stableUuid(label, key),
    raw_utterance: record.text,
    request_context: JSON.stringify({
      reference_date: generatedReviewReferenceDate,
      timezone: generatedReviewTimezone,
      generated_review_label: label,
      source_record_id: record.id ?? null,
      generator_version: record.generator_version ?? null,
      locale: record.locale ?? null,
      difficulty: record.difficulty ?? null,
      phrase_family: record.phrase_family ?? null,
      original_source: record.source ?? null,
    }),
    predicted_interpretation: JSON.stringify(predicted),
    corrected_interpretation: JSON.stringify(corrected),
    parser_version: generatedReviewParserVersion,
    normalizer_version: generatedReviewNormalizerVersion,
    schema_version: generatedReviewSchemaVersion,
    source: generatedReviewSource(label),
    outcome: sameInterpretation(predicted, corrected) ? "confirmed" : "corrected",
    latency_ms: 0,
    created_at: timestamp,
    resolved_at: timestamp,
  };
}

function sqlLiteral(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function recordSql(record: ImportedInferenceLogRecord): string {
  return `INSERT INTO inference_logs (
    id, raw_utterance, request_context, predicted_interpretation,
    corrected_interpretation, parser_version, normalizer_version, schema_version,
    source, outcome, latency_ms, created_at, resolved_at
  ) VALUES (
    ${sqlLiteral(record.id)},
    ${sqlLiteral(record.raw_utterance)},
    ${sqlLiteral(record.request_context)},
    ${sqlLiteral(record.predicted_interpretation)},
    ${sqlLiteral(record.corrected_interpretation)},
    ${sqlLiteral(record.parser_version)},
    ${sqlLiteral(record.normalizer_version)},
    ${sqlLiteral(record.schema_version)},
    ${sqlLiteral(record.source)},
    ${sqlLiteral(record.outcome)},
    ${sqlLiteral(record.latency_ms)},
    ${sqlLiteral(record.created_at)},
    ${sqlLiteral(record.resolved_at)}
  )
  ON CONFLICT(id) DO UPDATE SET
    raw_utterance = excluded.raw_utterance,
    request_context = excluded.request_context,
    predicted_interpretation = excluded.predicted_interpretation,
    corrected_interpretation = excluded.corrected_interpretation,
    parser_version = excluded.parser_version,
    normalizer_version = excluded.normalizer_version,
    schema_version = excluded.schema_version,
    source = excluded.source,
    outcome = excluded.outcome,
    latency_ms = excluded.latency_ms,
    created_at = excluded.created_at,
    resolved_at = excluded.resolved_at;`;
}

function upsertRecord(database: DatabaseSync, record: ImportedInferenceLogRecord): void {
  database.prepare(
    `INSERT INTO inference_logs (
      id, raw_utterance, request_context, predicted_interpretation,
      corrected_interpretation, parser_version, normalizer_version, schema_version,
      source, outcome, latency_ms, created_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      raw_utterance = excluded.raw_utterance,
      request_context = excluded.request_context,
      predicted_interpretation = excluded.predicted_interpretation,
      corrected_interpretation = excluded.corrected_interpretation,
      parser_version = excluded.parser_version,
      normalizer_version = excluded.normalizer_version,
      schema_version = excluded.schema_version,
      source = excluded.source,
      outcome = excluded.outcome,
      latency_ms = excluded.latency_ms,
      created_at = excluded.created_at,
      resolved_at = excluded.resolved_at`,
  ).run(
    record.id,
    record.raw_utterance,
    record.request_context,
    record.predicted_interpretation,
    record.corrected_interpretation,
    record.parser_version,
    record.normalizer_version,
    record.schema_version,
    record.source,
    record.outcome,
    record.latency_ms,
    record.created_at,
    record.resolved_at,
  );
}

function localGeneratedReviewCount(database: DatabaseSync): number {
  const definition = annotationQueueQuery("generated_review");
  const countQuery = definition.query.replace(/\s+LIMIT \?\s*$/u, "");
  const row = database.prepare(`SELECT COUNT(*) AS count FROM (${countQuery}) q`).get() as
    | { count: number }
    | undefined;
  return Number(row?.count ?? 0);
}

function remoteImport(records: ImportedInferenceLogRecord[]): void {
  const tempDirectory = mkdtempSync(resolve(tmpdir(), "jangoing-generated-review-"));
  const filePath = resolve(tempDirectory, "import.sql");
  writeFileSync(filePath, records.map(recordSql).join("\n"));
  try {
    const result = spawnSync(
      "npx",
      ["wrangler", "d1", "execute", "jangoing-db", "--remote", "--file", filePath],
      { cwd: apiDirectory, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || "Remote generated-review import failed");
    }
    process.stdout.write(result.stdout);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function localImport(records: ImportedInferenceLogRecord[]): void {
  mkdirSync(dirname(localDatabasePath), { recursive: true });
  const database = new DatabaseSync(localDatabasePath);
  let transactionOpen = false;
  try {
    ensureLocalSchema(database);
    database.exec("BEGIN");
    transactionOpen = true;
    for (const record of records) {
      upsertRecord(database, record);
    }
    database.exec("COMMIT");
    transactionOpen = false;
    process.stdout.write(`Local DB: ${localDatabasePath}\n`);
    process.stdout.write(`- generated_review: ${localGeneratedReviewCount(database)} available\n`);
  } catch (error) {
    if (transactionOpen) {
      database.exec("ROLLBACK");
    }
    throw error;
  } finally {
    database.close();
  }
}

const options = parseArgs(process.argv.slice(2));
const inputPath = isAbsolute(options.input) ? options.input : resolve(repositoryRoot, options.input);
const inferredLabel = options.label || basename(inputPath, extname(inputPath));
const generatedRecords = readGeneratedRecords(inputPath, options.limit);
const importedRecords = generatedRecords.map((record, index) => importRecord(record, inferredLabel, index));

process.stdout.write(`Importing ${importedRecords.length} generated review records from ${inputPath}\n`);
process.stdout.write(`- label: ${inferredLabel}\n`);

if (options.remote) {
  remoteImport(importedRecords);
  process.stdout.write("Remote generated-review import finished.\n");
} else {
  localImport(importedRecords);
}
