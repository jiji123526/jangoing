import {
  ConfirmActionRequestSchema,
  CreateAnnotationRequestSchema,
  EventRecordSchema,
  InterpretCommandRequestSchema,
  UpdateInferenceOutcomeRequestSchema,
  type EventRecord,
} from "@jangoing/contracts";
import { projectInventory, projectShoppingList } from "./domain/projections";
import { parseCommand } from "./nlp/parse-command";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
}

const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
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
    entities.map((entity) => [
      keys[entity.label],
      entity.normalized_value ?? entity.text,
    ]),
  );
}

function configuredOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : localOrigins;
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");

  if (origin && configuredOrigins(env).includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function isDisallowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && !configuredOrigins(env).includes(origin));
}

function json(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

async function readEvents(env: Env, limit?: number): Promise<EventRecord[]> {
  const statement = limit
    ? env.DB.prepare(
        "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?",
      ).bind(limit)
    : env.DB.prepare(
        "SELECT * FROM events ORDER BY created_at ASC, id ASC",
      );
  const result = await statement.all<Record<string, unknown>>();

  return result.results.map((row) => EventRecordSchema.parse(row));
}

async function handleInterpret(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  const body = await request.json();
  const parsed = InterpretCommandRequestSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      request,
      env,
      { error: "Invalid command", details: parsed.error.flatten() },
      400,
    );
  }

  const result = parseCommand(parsed.data);
  const inferenceId = crypto.randomUUID();
  const latencyMs = Date.now() - startedAt;
  await env.DB.prepare(
    `INSERT INTO inference_logs (
      id, raw_utterance, request_context, predicted_interpretation,
      parser_version, normalizer_version, schema_version, source,
      outcome, latency_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    inferenceId,
    result.raw_utterance,
    JSON.stringify({ expiration_date: parsed.data.expiration_date ?? null }),
    JSON.stringify(result),
    parserVersion,
    normalizerVersion,
    schemaVersion,
    "web",
    latencyMs,
    new Date().toISOString(),
  ).run();
  return json(request, env, {
    ...result,
    inference_id: inferenceId,
    parser_version: parserVersion,
    latency_ms: latencyMs,
  });
}

async function handleInferenceOutcome(request: Request, env: Env): Promise<Response> {
  const parsed = UpdateInferenceOutcomeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(request, env, { error: "Invalid inference outcome" }, 400);
  }
  const result = await env.DB.prepare(
    `UPDATE inference_logs SET outcome = ?, corrected_interpretation = ?, resolved_at = ?
     WHERE id = ? AND outcome = 'pending'`,
  ).bind(
    parsed.data.outcome,
    parsed.data.reviewed_interpretation
      ? JSON.stringify(parsed.data.reviewed_interpretation)
      : null,
    new Date().toISOString(),
    parsed.data.inference_id,
  ).run();
  if (!result.meta.changes) {
    return json(request, env, { error: "Pending inference not found" }, 404);
  }
  return json(request, env, { success: true });
}

async function handleAnnotationStats(request: Request, env: Env): Promise<Response> {
  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS annotated,
      SUM(CASE WHEN dataset_purpose = 'train_candidate' THEN 1 ELSE 0 END) AS train_candidates,
      SUM(CASE WHEN dataset_purpose = 'evaluation_candidate' THEN 1 ELSE 0 END) AS evaluation_candidates
     FROM annotations`,
  ).first<{ annotated: number; train_candidates: number | null; evaluation_candidates: number | null }>();
  return json(request, env, {
    annotated: Number(counts?.annotated ?? 0),
    train_candidates: Number(counts?.train_candidates ?? 0),
    evaluation_candidates: Number(counts?.evaluation_candidates ?? 0),
  });
}

async function handleCreateAnnotation(request: Request, env: Env): Promise<Response> {
  const parsed = CreateAnnotationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(request, env, { error: "Invalid annotation", details: parsed.error.flatten() }, 400);
  }
  const inference = await env.DB.prepare(
    "SELECT raw_utterance FROM inference_logs WHERE id = ?",
  ).bind(parsed.data.inference_id).first<{ raw_utterance: string }>();
  if (!inference) return json(request, env, { error: "Inference not found" }, 404);
  const actions = parsed.data.actions.map((action) => ({
    ...action,
    entities: [...action.entities].sort((a, b) => a.start - b.start),
  }));
  for (const action of actions) {
    for (let index = 0; index < action.entities.length; index += 1) {
      const entity = action.entities[index];
      if (inference.raw_utterance.slice(entity.start, entity.end) !== entity.text) {
        return json(request, env, { error: `Entity span does not match: ${entity.text}` }, 400);
      }
      if (index > 0 && action.entities[index - 1].end > entity.start) {
        return json(request, env, { error: "Entity spans cannot overlap within an action" }, 400);
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
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO annotations (
          id, inference_id, intent, entities, normalized, dataset_purpose,
          phrase_family, notes, annotator, annotation_schema_version, created_at,
          actions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), parsed.data.inference_id, legacyAction.intent,
        JSON.stringify(legacyAction.entities), JSON.stringify(legacyAction.normalized),
        parsed.data.dataset_purpose, legacyAction.phrase_family ?? null,
        parsed.data.notes ?? null, parsed.data.annotator, annotationSchemaVersion,
        createdAt, JSON.stringify(enrichedActions),
      ),
      env.DB.prepare(
        `UPDATE inference_logs SET outcome = 'annotated', corrected_interpretation = ?,
         resolved_at = ? WHERE id = ?`,
      ).bind(
        JSON.stringify({ actions: enrichedActions }),
        createdAt, parsed.data.inference_id,
      ),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return json(request, env, { error: "Inference is already annotated" }, 409);
    }
    throw error;
  }
  return json(request, env, { success: true }, 201);
}

async function handleCreateEvent(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.json();
  const parsed = ConfirmActionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      request,
      env,
      { error: "Invalid event", details: parsed.error.flatten() },
      400,
    );
  }

  const submission = parsed.data;
  const pendingInference = await env.DB.prepare(
    "SELECT id FROM inference_logs WHERE id = ? AND outcome = 'pending'",
  ).bind(submission.inference_id).first();
  if (!pendingInference) {
    return json(request, env, { error: "Pending inference not found" }, 409);
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

  await env.DB.prepare(
    `INSERT INTO events (
      id, event_type, item_name, quantity, unit, location,
      expiration_date, raw_utterance, confidence, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      event.id,
      event.event_type,
      event.item_name,
      event.quantity,
      event.unit,
      event.location,
      event.expiration_date,
      event.raw_utterance,
      event.confidence,
      event.source,
      event.created_at,
    )
    .run();

  const correctedInterpretation = {
    intent: Object.entries({
      item_added: "add_item",
      item_consumed: "consume_item",
      item_marked_low: "mark_low",
      item_thrown_away: "throw_away",
      item_added_to_buy: "add_to_buy",
    }).find(([eventType]) => eventType === event.event_type)?.[1],
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
  const predicted = {
    intent: submission.original_interpretation.intent,
    slots: submission.original_interpretation.slots,
  };

  await env.DB.prepare(
    `INSERT INTO corrections (
      id, event_id, raw_utterance, predicted_interpretation,
      corrected_interpretation, parser_version, was_corrected, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      event.id,
      event.raw_utterance,
      JSON.stringify(predicted),
      JSON.stringify(correctedInterpretation),
      submission.parser_version,
      JSON.stringify(predicted) === JSON.stringify(correctedInterpretation) ? 0 : 1,
      event.created_at,
    )
    .run();

  const outcome = JSON.stringify(predicted) === JSON.stringify(correctedInterpretation)
    ? "confirmed"
    : "corrected";
  await env.DB.prepare(
    `UPDATE inference_logs SET corrected_interpretation = ?, outcome = ?,
      event_id = ?, resolved_at = ? WHERE id = ? AND outcome = 'pending'`,
  ).bind(
    JSON.stringify(correctedInterpretation), outcome, event.id,
    event.created_at, submission.inference_id,
  ).run();

  return json(request, env, event, 201);
}

async function route(request: Request, env: Env): Promise<Response> {
  if (isDisallowedOrigin(request, env)) {
    return json(request, env, { error: "Origin not allowed" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json(request, env, { status: "ok" });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/commands/interpret"
  ) {
    return handleInterpret(request, env);
  }

  if (request.method === "POST" && url.pathname === "/events") {
    return handleCreateEvent(request, env);
  }

  if (request.method === "POST" && url.pathname === "/inferences/outcome") {
    return handleInferenceOutcome(request, env);
  }

  if (request.method === "GET" && url.pathname === "/annotations/stats") {
    return handleAnnotationStats(request, env);
  }

  if (request.method === "POST" && url.pathname === "/annotations") {
    return handleCreateAnnotation(request, env);
  }

  if (request.method === "GET" && url.pathname === "/events") {
    return json(request, env, { events: await readEvents(env, 50) });
  }

  if (request.method === "GET" && url.pathname === "/inventory") {
    return json(request, env, {
      inventory: projectInventory(await readEvents(env)),
    });
  }

  if (request.method === "GET" && url.pathname === "/shopping-list") {
    return json(request, env, {
      items: projectShoppingList(await readEvents(env)),
    });
  }

  return json(request, env, { error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json(request, env, { error: "Internal server error" }, 500);
    }
  },
};
