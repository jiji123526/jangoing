import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiDirectory, "../..");
const query = `SELECT id, raw_utterance, predicted_interpretation,
  corrected_interpretation, parser_version, outcome, created_at
  FROM inference_logs
  WHERE outcome IN ('confirmed', 'corrected', 'rejected')
    AND corrected_interpretation IS NOT NULL
  ORDER BY created_at ASC, id ASC`;
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const outputIndex = args.indexOf("--output");
const positionalOutput = args.find((argument) => !argument.startsWith("--"));
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : positionalOutput;

function localRows(): Array<Record<string, string>> {
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
    return database.prepare(query).all() as Array<Record<string, string>>;
  } finally {
    database.close();
  }
}

function remoteRows(): Array<Record<string, string>> {
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "jangoing-db", "--remote", "--command", query, "--json"],
    { cwd: apiDirectory, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Remote D1 export failed");
  }
  const payload = JSON.parse(result.stdout) as Array<{
    results?: Array<Record<string, string>>;
  }>;
  return payload.flatMap((entry) => entry.results ?? []);
}

const rows = remote ? remoteRows() : localRows();

const lines: string[] = [];
for (const row of rows) {
  const correctedPayload = JSON.parse(row.corrected_interpretation) as {
    intent: string;
    slots: Record<string, unknown>;
  };
  const corrected = {
    intent: correctedPayload.intent,
    slots: correctedPayload.slots,
  };
  const predicted = JSON.parse(row.predicted_interpretation);
  const phraseFamily = createHash("sha256")
    .update(row.raw_utterance.toLowerCase().replace(/[a-z0-9]+/g, "_"))
    .digest("hex")
    .slice(0, 12);
  lines.push(
    JSON.stringify({
      id: row.id,
      text: row.raw_utterance,
      intent: corrected.intent,
      slots: corrected.slots,
      predicted,
      outcome: row.outcome,
      parser_version: row.parser_version,
      phrase_family: phraseFamily,
      reviewed_at: row.created_at,
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
