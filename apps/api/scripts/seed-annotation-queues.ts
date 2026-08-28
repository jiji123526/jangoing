import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { annotationQueueQuery } from "../src/annotations/queue";
import {
  annotationQueueSeedSource,
  buildQueueSeedRecords,
  defaultQueueSeedPlan,
  seededQueueTargets,
  type QueueSeedPlan,
  type SeededInferenceLogRecord,
} from "../src/annotations/queue-seed";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDatabasePath =
  process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
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

interface SeedScriptOptions extends QueueSeedPlan {
  remote: boolean;
}

function parseArgs(argv: string[]): SeedScriptOptions {
  const defaults = defaultQueueSeedPlan();
  const options: SeedScriptOptions = {
    ...defaults,
    remote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--remote") {
      options.remote = true;
      continue;
    }

    if (current === "--correction" && next) {
      options.correction = Number(next);
      index += 1;
      continue;
    }

    if (current === "--expiry" && next) {
      options.expiry = Number(next);
      index += 1;
      continue;
    }

    if (current === "--low-confidence" && next) {
      options.low_confidence = Number(next);
      index += 1;
      continue;
    }

    if (current === "--confirmed" && next) {
      options.confirmed_unannotated = Number(next);
      index += 1;
      continue;
    }

    if (current === "--evaluation" && next) {
      options.evaluation_holdout = Number(next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  for (const [name, value] of Object.entries(options)) {
    if (name === "remote") continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer`);
    }
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

function upsertRecord(database: DatabaseSync, record: SeededInferenceLogRecord): void {
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

function localQueueCounts(database: DatabaseSync): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const type of [
    "correction",
    "expiry",
    "low_confidence",
    "confirmed_unannotated",
    "evaluation_holdout",
  ] as const) {
    const definition = annotationQueueQuery(type);
    const countQuery = definition.query.replace(/\s+LIMIT \?\s*$/u, "");
    const row = database.prepare(`SELECT COUNT(*) AS count FROM (${countQuery}) q`).get() as
      | { count: number }
      | undefined;
    counts[type] = Number(row?.count ?? 0);
  }

  return counts;
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function recordSql(record: SeededInferenceLogRecord): string {
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

function remoteSeed(records: SeededInferenceLogRecord[]): void {
  const tempDirectory = mkdtempSync(resolve(tmpdir(), "jangoing-queue-seed-"));
  const filePath = resolve(tempDirectory, "seed.sql");
  const statements = records.map(recordSql);

  writeFileSync(filePath, statements.join("\n"));
  try {
    const result = spawnSync(
      "npx",
      ["wrangler", "d1", "execute", "jangoing-db", "--remote", "--file", filePath],
      { cwd: apiDirectory, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || "Remote queue seeding failed");
    }
    process.stdout.write(result.stdout);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function localSeed(records: SeededInferenceLogRecord[]): void {
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

    const counts = localQueueCounts(database);
    process.stdout.write(`Local DB: ${localDatabasePath}\n`);
    for (const [queueType, count] of Object.entries(counts)) {
      process.stdout.write(`- ${queueType}: ${count} available\n`);
    }
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
const records = buildQueueSeedRecords(options);
const targets = seededQueueTargets(options);

process.stdout.write("Seeding annotation queues with deterministic synthetic reviewed samples.\n");
process.stdout.write(`- source: ${annotationQueueSeedSource}\n`);
for (const [queueType, count] of Object.entries(targets)) {
  process.stdout.write(`- target ${queueType}: ${count}\n`);
}

if (options.remote) {
  remoteSeed(records);
  process.stdout.write("Remote D1 queue seed finished.\n");
} else {
  localSeed(records);
}
