import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiDirectory, "../..");
const query = `SELECT il.id, il.raw_utterance, il.predicted_interpretation,
  il.corrected_interpretation, il.parser_version, il.outcome, il.created_at,
  a.intent AS annotation_intent, a.entities AS annotation_entities,
  a.normalized AS annotation_normalized, a.dataset_purpose,
  a.phrase_family AS annotation_phrase_family, a.created_at AS annotation_created_at
  FROM inference_logs il
  LEFT JOIN annotations a ON a.inference_id = il.id
  WHERE a.id IS NOT NULL OR (
    il.outcome IN ('confirmed', 'corrected', 'rejected')
    AND il.corrected_interpretation IS NOT NULL
  )
  ORDER BY il.created_at ASC, il.id ASC`;
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const outputIndex = args.indexOf("--output");
const positionalOutput = args.find((argument) => !argument.startsWith("--"));
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : positionalOutput;

function localRows(): Array<Record<string, string | null>> {
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
    return database.prepare(query).all() as Array<Record<string, string | null>>;
  } finally {
    database.close();
  }
}

function remoteRows(): Array<Record<string, string | null>> {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "jangoing-db", "--remote", "--command", query, "--json"],
    { cwd: apiDirectory, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Remote D1 export failed");
  }
  const payload = JSON.parse(result.stdout) as Array<{
    results?: Array<Record<string, string | null>>;
  }>;
  return payload.flatMap((entry) => entry.results ?? []);
}

const rows = remote ? remoteRows() : localRows();

const lines: string[] = [];
for (const row of rows) {
  const correctedPayload = row.corrected_interpretation
    ? (JSON.parse(row.corrected_interpretation) as {
        intent: string;
        slots?: Record<string, unknown>;
      })
    : null;
  const corrected = {
    intent: row.annotation_intent ?? correctedPayload?.intent,
    slots: row.annotation_normalized
      ? JSON.parse(row.annotation_normalized)
      : correctedPayload?.slots ?? {},
  };
  if (!corrected.intent || !row.predicted_interpretation || !row.raw_utterance) {
    continue;
  }
  const predicted = JSON.parse(row.predicted_interpretation);
  const generatedPhraseFamily = createHash("sha256")
    .update(row.raw_utterance.toLowerCase().replace(/[a-z0-9]+/g, "_"))
    .digest("hex")
    .slice(0, 12);
  lines.push(
    JSON.stringify({
      id: row.id,
      text: row.raw_utterance,
      intent: corrected.intent,
      slots: corrected.slots,
      entities: row.annotation_entities ? JSON.parse(row.annotation_entities) : [],
      predicted,
      outcome: row.outcome,
      parser_version: row.parser_version,
      dataset_purpose: row.dataset_purpose ?? "train_candidate",
      phrase_family: row.annotation_phrase_family ?? generatedPhraseFamily,
      reviewed_at: row.annotation_created_at ?? row.created_at,
    }),
  );
}

const payload = lines.length ? `${lines.join("\n")}\n` : "";
if (outputPath) {
  const resolvedOutput = isAbsolute(outputPath)
    ? outputPath
    : resolve(repositoryRoot, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, payload);
  process.stderr.write(`Exported ${lines.length} reviewed records to ${resolvedOutput}\n`);
  if (lines.length === 0) {
    process.stderr.write("No confirmed or corrected interactions are available yet.\n");
  }
} else {
  process.stdout.write(payload);
}
