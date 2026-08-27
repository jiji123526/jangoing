import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  buildDatasetRecords,
  filterDatasetRecords,
  parseDatasetExportArgs,
  serializeJsonl,
  splitAndValidateDataset,
  type ExportRow,
} from "../src/dataset-export";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiDirectory, "../..");
const query = `SELECT il.id, il.raw_utterance, il.predicted_interpretation,
  il.corrected_interpretation, il.parser_version, il.outcome, il.created_at,
  a.intent AS annotation_intent, a.entities AS annotation_entities,
  a.normalized AS annotation_normalized, a.dataset_purpose,
  a.phrase_family AS annotation_phrase_family, a.actions AS annotation_actions,
  a.annotation_schema_version, a.created_at AS annotation_created_at
  FROM inference_logs il
  LEFT JOIN annotations a ON a.inference_id = il.id
  WHERE a.id IS NOT NULL OR (
    il.outcome IN ('confirmed', 'corrected', 'rejected')
    AND il.corrected_interpretation IS NOT NULL
  )
  ORDER BY il.created_at ASC, il.id ASC`;
const options = parseDatasetExportArgs(process.argv.slice(2));

function localRows(): ExportRow[] {
  const databasePath =
    process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
  if (!existsSync(databasePath)) {
    throw new Error(
      `Local database not found at ${databasePath}. Run npm run dev:api and ` +
        "review commands first, or pass --remote to export production D1.",
    );
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database.prepare(query).all() as ExportRow[];
  } finally {
    database.close();
  }
}

function remoteRows(): ExportRow[] {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "jangoing-db", "--remote", "--command", query, "--json"],
    { cwd: apiDirectory, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Remote D1 export failed");
  }
  const payload = JSON.parse(result.stdout) as Array<{
    results?: ExportRow[];
  }>;
  return payload.flatMap((entry) => entry.results ?? []);
}

const trainOutput = isAbsolute(options.trainOutput)
  ? options.trainOutput
  : resolve(repositoryRoot, options.trainOutput);
const evaluationOutput = isAbsolute(options.evaluationOutput)
  ? options.evaluationOutput
  : resolve(repositoryRoot, options.evaluationOutput);
if (trainOutput === evaluationOutput) {
  throw new Error("Training and evaluation outputs resolve to the same file");
}

const rows = options.remote ? remoteRows() : localRows();
const records = filterDatasetRecords(buildDatasetRecords(rows), options);
const { training, evaluation } = splitAndValidateDataset(records);

mkdirSync(dirname(trainOutput), { recursive: true });
mkdirSync(dirname(evaluationOutput), { recursive: true });
writeFileSync(trainOutput, serializeJsonl(training));
writeFileSync(evaluationOutput, serializeJsonl(evaluation));
process.stderr.write(`Exported ${training.length} training records to ${trainOutput}\n`);
process.stderr.write(`Exported ${evaluation.length} evaluation records to ${evaluationOutput}\n`);
process.stderr.write(`Task mode: ${options.task}${options.requireAnnotation ? " (annotation required)" : ""}\n`);
if (training.length === 0 || evaluation.length === 0) {
  process.stderr.write("Warning: one or more dataset splits are empty.\n");
}
