import {
  AnnotationAssistantProposalRequestSchema,
  AnnotationAssistantProposalSchema,
  AnnotationNormalizedValuesResponseSchema,
  ConfirmActionRequestSchema,
  CreateAnnotationRequestSchema,
  EventRecordSchema,
  InterpretationSchema,
  InterpretCommandRequestSchema,
  UpdateInferenceOutcomeRequestSchema,
  type EventRecord,
  type Interpretation,
} from "@jangoing/contracts";
import {
  buildAnnotationAssistantProposal,
} from "./annotations/assistant-proposal";
import {
  collectAnnotationNormalizedValues,
  type AnnotationNormalizedValueRow,
} from "./annotations/normalized-values";
import {
  annotationQueueQuery,
  type AnnotationQueueRow,
  buildAnnotationQueueItems,
  parseAnnotationQueueQuery,
} from "./annotations/queue";
import { projectInventory, projectShoppingList } from "./domain/projections";
import { parseCommand } from "./nlp/parse-command";
import { resolveTemporalGrounding } from "./nlp/temporal-grounding";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_MONTHLY_BUDGET_USD?: string;
}

const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const parserVersion = "rules-v1";
const normalizerVersion = "normalizers-v1";
const schemaVersion = "inference-v1";
const annotationSchemaVersion = "annotation-v3";

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

function parseStoredInterpretation(payload: string): Interpretation {
  return InterpretationSchema.parse(JSON.parse(payload));
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
  const receivedAt = new Date();
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

  const temporalContext = resolveTemporalGrounding(parsed.data, receivedAt);
  const result = parseCommand({ ...parsed.data, ...temporalContext });
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
    JSON.stringify({
      expiration_date: parsed.data.expiration_date ?? null,
      reference_date: temporalContext.reference_date,
      timezone: temporalContext.timezone,
      conversation_id: parsed.data.conversation_id ?? null,
      turn_index: parsed.data.turn_index ?? null,
      speaker_role: parsed.data.speaker_role ?? null,
      activation_mode: parsed.data.activation_mode ?? null,
    }),
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

async function handleAnnotationQueue(request: Request, env: Env): Promise<Response> {
  let queueInput;
  try {
    queueInput = parseAnnotationQueueQuery(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
  } catch {
    return json(request, env, { error: "Invalid annotation queue request" }, 400);
  }

  try {
    const definition = annotationQueueQuery(queueInput.type);
    const result = await env.DB.prepare(definition.query)
      .bind(queueInput.limit)
      .all<AnnotationQueueRow>();

    return json(request, env, {
      items: buildAnnotationQueueItems(queueInput.type, result.results),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not implemented yet")) {
      return json(request, env, { error: error.message }, 400);
    }
    throw error;
  }
}

async function handleAnnotationNormalizedValues(
  request: Request,
  env: Env,
): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT actions, entities FROM annotations ORDER BY created_at ASC, id ASC",
  ).all<AnnotationNormalizedValueRow>();

  return json(
    request,
    env,
    AnnotationNormalizedValuesResponseSchema.parse(
      collectAnnotationNormalizedValues(result.results),
    ),
  );
}

async function handleAnnotationAssistantProposal(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsed = AnnotationAssistantProposalRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(request, env, { error: "Invalid annotation proposal request" }, 400);
  }

  const inference = await env.DB.prepare(
    "SELECT raw_utterance, predicted_interpretation FROM inference_logs WHERE id = ?",
  ).bind(parsed.data.inference_id).first<{
    raw_utterance: string;
    predicted_interpretation: string;
  }>();

  if (!inference) {
    return json(request, env, { error: "Inference not found" }, 404);
  }

  const monthlyBudget = Number(env.OPENAI_MONTHLY_BUDGET_USD ?? "5");
  if (env.OPENAI_API_KEY && Number.isFinite(monthlyBudget) && monthlyBudget > 0) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const usage = await env.DB.prepare(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
       FROM annotation_proposals
       WHERE created_at >= ?`,
    ).bind(monthStart.toISOString()).first<{ total: number }>();
    if ((usage?.total ?? 0) >= monthlyBudget) {
      return json(request, env, { error: "Monthly annotation AI budget reached" }, 429);
    }
  }

  const normalizedValueRows = await env.DB.prepare(
    "SELECT actions, entities FROM annotations ORDER BY created_at ASC, id ASC",
  ).all<AnnotationNormalizedValueRow>();

  const generated = await buildAnnotationAssistantProposal(env, {
    inference_id: parsed.data.inference_id,
    raw_utterance: inference.raw_utterance,
    predicted_interpretation: parseStoredInterpretation(inference.predicted_interpretation),
    preferred_normalized_values: collectAnnotationNormalizedValues(normalizedValueRows.results),
  });
  const { usage, ...proposalDraft } = generated;

  const createdAt = new Date().toISOString();
  const proposal = AnnotationAssistantProposalSchema.parse({
    proposal_id: crypto.randomUUID(),
    inference_id: parsed.data.inference_id,
    ...proposalDraft,
    created_at: createdAt,
  });

  await env.DB.prepare(
    `INSERT INTO annotation_proposals (
      id, inference_id, provider, model, prompt_version, proposal,
      note, input_tokens, output_tokens, estimated_cost_usd, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
  ).bind(
    proposal.proposal_id,
    proposal.inference_id,
    proposal.provider,
    proposal.model,
    proposal.prompt_version,
    JSON.stringify(proposal.actions),
    proposal.note ?? null,
    usage?.input_tokens ?? null,
    usage?.output_tokens ?? null,
    usage?.estimated_cost_usd ?? null,
    proposal.created_at,
  ).run();

  return json(request, env, proposal, 201);
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

  if (parsed.data.assistant_proposal_id) {
    const proposal = await env.DB.prepare(
      "SELECT id, applied_annotation_id FROM annotation_proposals WHERE id = ? AND inference_id = ?",
    ).bind(
      parsed.data.assistant_proposal_id,
      parsed.data.inference_id,
    ).first<{ id: string; applied_annotation_id: string | null }>();

    if (!proposal) {
      return json(request, env, { error: "Assistant proposal not found" }, 400);
    }

    if (proposal.applied_annotation_id) {
      return json(request, env, { error: "Assistant proposal is already linked to an annotation" }, 409);
    }
  }

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
  const relevance = parsed.data.relevance ?? "actionable";
  const legacyAction = enrichedActions[0] ?? {
    intent: "unknown",
    entities: [],
    normalized: {},
    phrase_family: null,
  };
  const annotationId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    const statements = [
      env.DB.prepare(
        `INSERT INTO annotations (
          id, inference_id, intent, entities, normalized, dataset_purpose,
          phrase_family, notes, annotator, annotation_schema_version, created_at,
          actions, relevance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        annotationId, parsed.data.inference_id, legacyAction.intent,
        JSON.stringify(legacyAction.entities), JSON.stringify(legacyAction.normalized),
        parsed.data.dataset_purpose, legacyAction.phrase_family ?? null,
        parsed.data.notes ?? null, parsed.data.annotator, annotationSchemaVersion,
        createdAt, JSON.stringify(enrichedActions), relevance,
      ),
      env.DB.prepare(
        `UPDATE inference_logs SET outcome = 'annotated', corrected_interpretation = ?,
         resolved_at = ? WHERE id = ?`,
      ).bind(
        JSON.stringify({ relevance, actions: enrichedActions }),
        createdAt, parsed.data.inference_id,
      ),
    ];

    if (parsed.data.assistant_proposal_id && parsed.data.assistant_resolution) {
      statements.push(
        env.DB.prepare(
          `UPDATE annotation_proposals
           SET status = 'applied', resolution = ?, applied_annotation_id = ?, applied_at = ?
           WHERE id = ? AND inference_id = ?`,
        ).bind(
          parsed.data.assistant_resolution,
          annotationId,
          createdAt,
          parsed.data.assistant_proposal_id,
          parsed.data.inference_id,
        ),
      );
    }

    await env.DB.batch(statements);
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
      item_marked_out: "mark_out",
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

  if (request.method === "GET" && url.pathname === "/annotations/queue") {
    return handleAnnotationQueue(request, env);
  }

  if (request.method === "GET" && url.pathname === "/annotations/normalized-values") {
    return handleAnnotationNormalizedValues(request, env);
  }

  if (request.method === "POST" && url.pathname === "/annotations/proposal") {
    return handleAnnotationAssistantProposal(request, env);
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
