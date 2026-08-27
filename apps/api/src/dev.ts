import {
  ConfirmActionRequestSchema,
  CreateAnnotationRequestSchema,
  EventRecordSchema,
  InterpretCommandRequestSchema,
  UpdateInferenceOutcomeRequestSchema,
  type EventRecord,
} from "@jangoing/contracts";
import { mkdirSync, readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  annotationQueueQuery,
  type AnnotationQueueRow,
  buildAnnotationQueueItems,
  parseAnnotationQueueQuery,
} from "./annotations/queue";
import { projectInventory, projectShoppingList } from "./domain/projections";
import { parseCommand } from "./nlp/parse-command";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath =
  process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
const migrationPath = resolve(
  apiDirectory,
  "migrations/0001_create_events.sql",
);
const correctionMigrationPath = resolve(
  apiDirectory,
  "migrations/0002_create_corrections.sql",
);
const inferenceMigrationPath = resolve(
  apiDirectory,
  "migrations/0003_create_inference_logs.sql",
);
const annotationMigrationPath = resolve(
  apiDirectory,
  "migrations/0004_create_annotations.sql",
);
const annotationActionsMigrationPath = resolve(
  apiDirectory,
  "migrations/0005_add_annotation_actions.sql",
);
const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim());

mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
const migration = readFileSync(migrationPath, "utf8")
  .replace("CREATE TABLE events", "CREATE TABLE IF NOT EXISTS events")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
database.exec(migration);
const correctionMigration = readFileSync(correctionMigrationPath, "utf8")
  .replace("CREATE TABLE corrections", "CREATE TABLE IF NOT EXISTS corrections")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
database.exec(correctionMigration);
const inferenceMigration = readFileSync(inferenceMigrationPath, "utf8")
  .replace("CREATE TABLE inference_logs", "CREATE TABLE IF NOT EXISTS inference_logs")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
database.exec(inferenceMigration);
const annotationMigration = readFileSync(annotationMigrationPath, "utf8")
  .replace("CREATE TABLE annotations", "CREATE TABLE IF NOT EXISTS annotations")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
database.exec(annotationMigration);
const annotationColumns = database.prepare("PRAGMA table_info(annotations)").all() as Array<{ name: string }>;
if (!annotationColumns.some((column) => column.name === "actions")) {
  database.exec(readFileSync(annotationActionsMigrationPath, "utf8"));
}
const parserVersion = "rules-v1";
const normalizerVersion = "normalizers-v1";
const schemaVersion = "inference-v1";
const annotationSchemaVersion = "annotation-v2";

function normalizedFromEntities(entities: Array<{
  label: string;
  text: string;
  normalized_value?: string | number;
}>): Record<string, string | number> {
  const keys: Record<string, string> = {
    ITEM: "item_name",
    CATEGORY: "category",
    QUANTITY: "quantity",
    UNIT: "unit",
    LOCATION: "location",
    EXPIRY_DATE: "expiration_date",
  };
  return Object.fromEntries(
    entities.map((entity) => [keys[entity.label], entity.normalized_value ?? entity.text]),
  );
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolveBody(text ? JSON.parse(text) : null);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function events(limit?: number): EventRecord[] {
  const query = limit
    ? "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?"
    : "SELECT * FROM events ORDER BY created_at ASC, id ASC";
  const rows = limit
    ? database.prepare(query).all(limit)
    : database.prepare(query).all();

  return rows.map((row) => EventRecordSchema.parse(row));
}

function responseHeaders(origin?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function sendJson(
  response: ServerResponse,
  origin: string | undefined,
  body: unknown,
  status = 200,
): void {
  response.writeHead(status, responseHeaders(origin));
  response.end(JSON.stringify(body));
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const origin = request.headers.origin;

  if (origin && !allowedOrigins.includes(origin)) {
    sendJson(response, origin, { error: "Origin not allowed" }, 403);
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, responseHeaders(origin));
    response.end();
    return;
  }

  const path = new URL(request.url ?? "/", `http://localhost:${port}`).pathname;

  if (request.method === "GET" && path === "/health") {
    sendJson(response, origin, { status: "ok" });
    return;
  }

  if (request.method === "POST" && path === "/commands/interpret") {
    const startedAt = Date.now();
    const parsed = InterpretCommandRequestSchema.safeParse(
      await readBody(request),
    );
    if (!parsed.success) {
      sendJson(
        response,
        origin,
        { error: "Invalid command", details: parsed.error.flatten() },
        400,
      );
      return;
    }

    const result = parseCommand(parsed.data);
    const inferenceId = crypto.randomUUID();
    const latencyMs = Date.now() - startedAt;
    database.prepare(
      `INSERT INTO inference_logs (
        id, raw_utterance, request_context, predicted_interpretation,
        parser_version, normalizer_version, schema_version, source,
        outcome, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      inferenceId, result.raw_utterance,
      JSON.stringify({ expiration_date: parsed.data.expiration_date ?? null }),
      JSON.stringify(result), parserVersion, normalizerVersion, schemaVersion,
      "web", latencyMs, new Date().toISOString(),
    );
    sendJson(response, origin, {
      ...result, inference_id: inferenceId, parser_version: parserVersion, latency_ms: latencyMs,
    });
    return;
  }

  if (request.method === "POST" && path === "/inferences/outcome") {
    const parsed = UpdateInferenceOutcomeRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(response, origin, { error: "Invalid inference outcome" }, 400);
      return;
    }
    const result = database.prepare(
      `UPDATE inference_logs SET outcome = ?, corrected_interpretation = ?, resolved_at = ?
       WHERE id = ? AND outcome = 'pending'`,
    ).run(
      parsed.data.outcome,
      parsed.data.reviewed_interpretation
        ? JSON.stringify(parsed.data.reviewed_interpretation)
        : null,
      new Date().toISOString(),
      parsed.data.inference_id,
    );
    sendJson(response, origin, result.changes ? { success: true } : { error: "Pending inference not found" }, result.changes ? 200 : 404);
    return;
  }

  if (request.method === "GET" && path === "/annotations/stats") {
    const row = database.prepare(
      `SELECT COUNT(*) AS annotated,
        SUM(CASE WHEN dataset_purpose = 'train_candidate' THEN 1 ELSE 0 END) AS train_candidates,
        SUM(CASE WHEN dataset_purpose = 'evaluation_candidate' THEN 1 ELSE 0 END) AS evaluation_candidates
       FROM annotations`,
    ).get() as { annotated: number; train_candidates: number | null; evaluation_candidates: number | null };
    sendJson(response, origin, {
      annotated: Number(row.annotated),
      train_candidates: Number(row.train_candidates ?? 0),
      evaluation_candidates: Number(row.evaluation_candidates ?? 0),
    });
    return;
  }

  if (request.method === "GET" && path === "/annotations/queue") {
    let queueInput;
    try {
      queueInput = parseAnnotationQueueQuery(
        Object.fromEntries(
          new URL(request.url ?? "/", `http://localhost:${port}`).searchParams.entries(),
        ),
      );
    } catch {
      sendJson(response, origin, { error: "Invalid annotation queue request" }, 400);
      return;
    }

    try {
      const definition = annotationQueueQuery(queueInput.type);
      const rows = database.prepare(definition.query).all(queueInput.limit) as unknown as AnnotationQueueRow[];
      sendJson(response, origin, {
        items: buildAnnotationQueueItems(queueInput.type, rows),
      });
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes("not implemented yet")) {
        sendJson(response, origin, { error: error.message }, 400);
        return;
      }
      throw error;
    }
  }

  if (request.method === "POST" && path === "/annotations") {
    const parsed = CreateAnnotationRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(response, origin, { error: "Invalid annotation", details: parsed.error.flatten() }, 400);
      return;
    }
    const inference = database.prepare(
      "SELECT raw_utterance FROM inference_logs WHERE id = ?",
    ).get(parsed.data.inference_id) as { raw_utterance: string } | undefined;
    if (!inference) {
      sendJson(response, origin, { error: "Inference not found" }, 404);
      return;
    }
    const actions = parsed.data.actions.map((action) => ({
      ...action,
      entities: [...action.entities].sort((a, b) => a.start - b.start),
    }));
    for (const action of actions) {
      for (let index = 0; index < action.entities.length; index += 1) {
        const entity = action.entities[index];
        if (inference.raw_utterance.slice(entity.start, entity.end) !== entity.text) {
          sendJson(response, origin, { error: `Entity span does not match: ${entity.text}` }, 400);
          return;
        }
        if (index > 0 && action.entities[index - 1].end > entity.start) {
          sendJson(response, origin, { error: "Entity spans cannot overlap within an action" }, 400);
          return;
        }
      }
    }
    const enrichedActions = actions.map((action) => ({
      ...action,
      normalized: normalizedFromEntities(action.entities),
    }));
    const legacyAction = enrichedActions[0];
    const createdAt = new Date().toISOString();
    try {
      database.exec("BEGIN");
      database.prepare(
        `INSERT INTO annotations (
          id, inference_id, intent, entities, normalized, dataset_purpose,
          phrase_family, notes, annotator, annotation_schema_version, created_at,
          actions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(), parsed.data.inference_id, legacyAction.intent,
        JSON.stringify(legacyAction.entities), JSON.stringify(legacyAction.normalized),
        parsed.data.dataset_purpose, legacyAction.phrase_family ?? null,
        parsed.data.notes ?? null, parsed.data.annotator, annotationSchemaVersion,
        createdAt, JSON.stringify(enrichedActions),
      );
      database.prepare(
        `UPDATE inference_logs SET outcome = 'annotated', corrected_interpretation = ?,
         resolved_at = ? WHERE id = ?`,
      ).run(
        JSON.stringify({ actions: enrichedActions }),
        createdAt, parsed.data.inference_id,
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      if (String(error).includes("UNIQUE")) {
        sendJson(response, origin, { error: "Inference is already annotated" }, 409);
        return;
      }
      throw error;
    }
    sendJson(response, origin, { success: true }, 201);
    return;
  }

  if (request.method === "POST" && path === "/events") {
    const parsed = ConfirmActionRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(
        response,
        origin,
        { error: "Invalid event", details: parsed.error.flatten() },
        400,
      );
      return;
    }

    const submission = parsed.data;
    const pendingInference = database.prepare(
      "SELECT id FROM inference_logs WHERE id = ? AND outcome = 'pending'",
    ).get(submission.inference_id);
    if (!pendingInference) {
      sendJson(response, origin, { error: "Pending inference not found" }, 409);
      return;
    }
    const event: EventRecord = {
      id: crypto.randomUUID(),
      ...submission.event,
      quantity: submission.event.quantity ?? null,
      unit: submission.event.unit ?? null,
      location: submission.event.location ?? null,
      expiration_date: submission.event.expiration_date ?? null,
      created_at: new Date().toISOString(),
    };

    database
      .prepare(
        `INSERT INTO events (
          id, event_type, item_name, quantity, unit, location,
          expiration_date, raw_utterance, confidence, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.event_type,
        event.item_name,
        event.quantity ?? null,
        event.unit ?? null,
        event.location ?? null,
        event.expiration_date ?? null,
        event.raw_utterance,
        event.confidence,
        event.source,
        event.created_at,
      );

    const intentByEventType = {
      item_added: "add_item",
      item_consumed: "consume_item",
      item_marked_low: "mark_low",
      item_thrown_away: "throw_away",
      item_added_to_buy: "add_to_buy",
    } as const;
    const predicted = {
      intent: submission.original_interpretation.intent,
      slots: submission.original_interpretation.slots,
    };
    const corrected = {
      intent: intentByEventType[event.event_type],
      slots: {
        item_name: event.item_name,
        ...(event.quantity !== null ? { quantity: event.quantity } : {}),
        ...(event.unit !== null ? { unit: event.unit } : {}),
        ...(event.location !== null ? { location: event.location } : {}),
        ...(event.expiration_date !== null
          ? { expiration_date: event.expiration_date }
          : {}),
      },
    };
    database.prepare(
      `INSERT INTO corrections (
        id, event_id, raw_utterance, predicted_interpretation,
        corrected_interpretation, parser_version, was_corrected, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(), event.id, event.raw_utterance,
      JSON.stringify(predicted), JSON.stringify(corrected),
      submission.parser_version,
      JSON.stringify(predicted) === JSON.stringify(corrected) ? 0 : 1,
      event.created_at,
    );

    const outcome = JSON.stringify(predicted) === JSON.stringify(corrected)
      ? "confirmed"
      : "corrected";
    database.prepare(
      `UPDATE inference_logs SET corrected_interpretation = ?, outcome = ?,
       event_id = ?, resolved_at = ? WHERE id = ? AND outcome = 'pending'`,
    ).run(
      JSON.stringify(corrected), outcome, event.id, event.created_at,
      submission.inference_id,
    );

    sendJson(response, origin, event, 201);
    return;
  }

  if (request.method === "GET" && path === "/events") {
    sendJson(response, origin, { events: events(50) });
    return;
  }

  if (request.method === "GET" && path === "/inventory") {
    sendJson(response, origin, { inventory: projectInventory(events()) });
    return;
  }

  if (request.method === "GET" && path === "/shopping-list") {
    sendJson(response, origin, { items: projectShoppingList(events()) });
    return;
  }

  sendJson(response, origin, { error: "Not found" }, 404);
}

const server = createServer((request, response) => {
  void route(request, response).catch((error) => {
    console.error(error);
    sendJson(
      response,
      request.headers.origin,
      { error: "Internal server error" },
      500,
    );
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`jangoing local API listening at http://localhost:${port}`);
  console.log(`Local SQLite database: ${databasePath}`);
});

function shutdown(): void {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
