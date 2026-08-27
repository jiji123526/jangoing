import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath =
  process.env.LOCAL_DB_PATH ?? resolve("apps/api/.local/jangoing.sqlite");
const database = new DatabaseSync(databasePath, { readOnly: true });
const rows = database
  .prepare(
    `SELECT id, raw_utterance, predicted_interpretation,
            corrected_interpretation, parser_version, outcome, created_at
     FROM inference_logs
     WHERE outcome IN ('confirmed', 'corrected')
       AND corrected_interpretation IS NOT NULL
     ORDER BY created_at ASC, id ASC`,
  )
  .all() as Array<Record<string, string>>;

const lines: string[] = [];
for (const row of rows) {
  const corrected = JSON.parse(row.corrected_interpretation) as {
    intent: string;
    slots: Record<string, unknown>;
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

database.close();
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const payload = lines.length ? `${lines.join("\n")}\n` : "";
if (outputPath) {
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, payload);
  process.stderr.write(`Exported ${lines.length} reviewed records to ${resolvedOutput}\n`);
} else {
  process.stdout.write(payload);
}
