import {
  AnnotationAssistantProposalRequestSchema,
  AnnotationAssistantProposalSchema,
  AnnotationNormalizedValuesResponseSchema,
  AdjustInventoryItemRequestSchema,
  ConfirmActionRequestSchema,
  CreateHouseholdRequestSchema,
  CreateAnnotationRequestSchema,
  EventRecordSchema,
  FridgeSetupRequestSchema,
  InterpretationSchema,
  InterpretCommandRequestSchema,
  JoinHouseholdRequestSchema,
  InventoryItemSchema,
  ShoppingListItemSchema,
  ShoppingItemContextRequestSchema,
  UpdateHouseholdProfileRequestSchema,
  UpdateInferenceOutcomeRequestSchema,
  type EventRecord,
  type InventoryItem,
  type Interpretation,
  type ShoppingListItem,
  type ShoppingItemContextRequest,
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
import { inventoryMutationEventType } from "./domain/inventory-mutation";
import {
  inventoryAttentionSnapshot,
  inventoryNeedsAttention,
} from "./domain/inventory-attention";
import {
  buildFridgeSetupEvents,
  fridgeSetupCompletedKey,
} from "./domain/fridge-setup";
import { parseCommand } from "./nlp/parse-command";
import {
  resolveStoredTemporalGrounding,
  resolveTemporalGrounding,
} from "./nlp/temporal-grounding";
import {
  AuthError,
  authenticateRequest,
  authenticateConsumerRequest,
  isConsumerPath,
  type AuthEnvironment,
} from "./auth";
import {
  HouseholdError,
  createHousehold,
  getCurrentHousehold,
  getCurrentHouseholdJoinCode,
  joinHousehold,
  listHouseholdMembers,
  removeHouseholdMember,
  revokeHouseholdJoinCodes,
  rotateHouseholdJoinCode,
  updateHouseholdProfile,
} from "./households";

interface Env extends AuthEnvironment {
  ALLOWED_ORIGINS?: string;
  HOUSEHOLD_CODE_SECRET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_MONTHLY_BUDGET_USD?: string;
}

interface ConsumerScope {
  householdId: string;
  userId: string;
}

const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const parserVersion = "rules-v2";
const normalizerVersion = "normalizers-v1";
const schemaVersion = "inference-v1";
const kitchenProjectionKey = "kitchen_projection_v1";
const annotationSchemaVersion = "annotation-v3";
const publicEventColumns = [
  "id",
  "event_type",
  "item_name",
  "quantity",
  "unit",
  "location",
  "expiration_date",
  "low_threshold",
  "category",
  "raw_utterance",
  "confidence",
  "source",
  "created_at",
].join(", ");

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
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

async function readEvents(
  env: Env,
  scope: ConsumerScope | null,
  limit?: number,
  since?: string,
): Promise<EventRecord[]> {
  const conditions = [
    scope ? "household_id = ?" : "household_id IS NULL",
  ];
  const bindings: Array<string | number> = scope ? [scope.householdId] : [];
  if (since) {
    conditions.push("created_at >= ?");
    bindings.push(since);
  }
  const descending = Boolean(since || limit);
  let query = `SELECT ${publicEventColumns} FROM events
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at ${descending ? "DESC" : "ASC"},
      id ${descending ? "DESC" : "ASC"}`;
  if (limit) {
    query += " LIMIT ?";
    bindings.push(limit);
  }
  const prepared = env.DB.prepare(query);
  const statement = bindings.length ? prepared.bind(...bindings) : prepared;
  const result = await statement.all<Record<string, unknown>>();

  return result.results.map((row) => EventRecordSchema.parse(row));
}

interface KitchenProjection {
  inventory: InventoryItem[];
  shoppingList: ShoppingListItem[];
}

function utcDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

async function readKitchenProjection(
  env: Env,
  scope: ConsumerScope | null,
): Promise<KitchenProjection | null> {
  const row = scope
    ? await env.DB.prepare(
        `SELECT value FROM household_app_state
         WHERE household_id = ? AND key = ?`,
      ).bind(scope.householdId, kitchenProjectionKey).first<{ value: string }>()
    : await env.DB.prepare(
        "SELECT value FROM app_state WHERE key = ?",
      ).bind(kitchenProjectionKey).first<{ value: string }>();
  if (!row) return null;

  try {
    const stored = JSON.parse(row.value) as Record<string, unknown>;
    if (stored.projectedOn !== utcDate()) return null;
    return {
      inventory: InventoryItemSchema.array().parse(stored.inventory),
      shoppingList: ShoppingListItemSchema.array().parse(stored.shoppingList),
    };
  } catch {
    return null;
  }
}

async function writeKitchenProjection(
  env: Env,
  scope: ConsumerScope | null,
  projection: KitchenProjection,
): Promise<void> {
  const value = JSON.stringify({
    ...projection,
    projectedOn: utcDate(),
  });
  const updatedAt = new Date().toISOString();
  if (scope) {
    await env.DB.prepare(
      `INSERT INTO household_app_state (household_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(household_id, key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).bind(
      scope.householdId,
      kitchenProjectionKey,
      value,
      updatedAt,
    ).run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).bind(kitchenProjectionKey, value, updatedAt).run();
}

async function loadKitchenProjection(
  env: Env,
  scope: ConsumerScope | null,
): Promise<{ projection: KitchenProjection; sourceEvents: EventRecord[] | null }> {
  const cached = await readKitchenProjection(env, scope);
  if (cached) return { projection: cached, sourceEvents: null };

  const sourceEvents = await readEvents(env, scope);
  const projection = {
    inventory: projectInventory(sourceEvents),
    shoppingList: projectShoppingList(sourceEvents),
  };
  await writeKitchenProjection(env, scope, projection);
  return { projection, sourceEvents };
}

async function invalidateKitchenProjection(
  env: Env,
  scope: ConsumerScope | null,
): Promise<void> {
  if (scope) {
    await env.DB.prepare(
      `DELETE FROM household_app_state
       WHERE household_id = ? AND key = ?`,
    ).bind(scope.householdId, kitchenProjectionKey).run();
    return;
  }

  await env.DB.prepare(
    "DELETE FROM app_state WHERE key = ?",
  ).bind(kitchenProjectionKey).run();
}

async function handleInterpret(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
): Promise<Response> {
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
      outcome, latency_ms, created_at, household_id, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
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
    scope?.householdId ?? null,
    scope?.userId ?? null,
  ).run();
  return json(request, env, {
    ...result,
    inference_id: inferenceId,
    parser_version: parserVersion,
    latency_ms: latencyMs,
  });
}

async function handleInferenceOutcome(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
): Promise<Response> {
  const parsed = UpdateInferenceOutcomeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(request, env, { error: "Invalid inference outcome" }, 400);
  }
  const result = await env.DB.prepare(
    `UPDATE inference_logs SET outcome = ?, corrected_interpretation = ?, resolved_at = ?
     WHERE id = ? AND outcome = 'pending'
       AND ${scope ? "household_id = ?" : "household_id IS NULL"}`,
  ).bind(
    parsed.data.outcome,
    parsed.data.reviewed_interpretation
      ? JSON.stringify(parsed.data.reviewed_interpretation)
      : null,
    new Date().toISOString(),
    parsed.data.inference_id,
    ...(scope ? [scope.householdId] : []),
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
    `SELECT raw_utterance, predicted_interpretation, request_context, created_at
     FROM inference_logs WHERE id = ?`,
  ).bind(parsed.data.inference_id).first<{
    raw_utterance: string;
    predicted_interpretation: string;
    request_context: string | null;
    created_at: string;
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
    temporal_context: resolveStoredTemporalGrounding(
      inference.request_context,
      inference.created_at,
    ),
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
  scope: ConsumerScope | null,
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
    `SELECT id FROM inference_logs
     WHERE id = ? AND outcome = 'pending'
       AND ${scope ? "household_id = ?" : "household_id IS NULL"}`,
  ).bind(
    submission.inference_id,
    ...(scope ? [scope.householdId] : []),
  ).first();
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
    low_threshold: submission.event.low_threshold ?? null,
    created_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO events (
      id, event_type, item_name, quantity, unit, location,
      expiration_date, low_threshold, raw_utterance, confidence, source, created_at,
      household_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      event.id,
      event.event_type,
      event.item_name,
      event.quantity ?? null,
      event.unit ?? null,
      event.location ?? null,
      event.expiration_date ?? null,
      event.low_threshold ?? null,
      event.raw_utterance,
      event.confidence,
      event.source,
      event.created_at,
      scope?.householdId ?? null,
      scope?.userId ?? null,
    )
    .run();
  await invalidateKitchenProjection(env, scope);

  const correctedInterpretation = {
    intent: Object.entries({
      item_added: "add_item",
      item_consumed: "consume_item",
      item_marked_low: "mark_low",
      item_marked_out: "mark_out",
      item_thrown_away: "throw_away",
      item_added_to_buy: "add_to_buy",
      item_low_threshold_set: "set_low_threshold",
    }).find(([eventType]) => eventType === event.event_type)?.[1],
    slots: {
      item_name: event.item_name,
      ...(event.quantity !== null ? { quantity: event.quantity } : {}),
      ...(event.unit !== null ? { unit: event.unit } : {}),
      ...(event.location !== null ? { location: event.location } : {}),
      ...(event.expiration_date !== null
        ? { expiration_date: event.expiration_date }
        : {}),
      ...(event.low_threshold !== null
        ? { low_threshold: event.low_threshold }
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
      event_id = ?, resolved_at = ? WHERE id = ? AND outcome = 'pending'
      AND ${scope ? "household_id = ?" : "household_id IS NULL"}`,
  ).bind(
    JSON.stringify(correctedInterpretation), outcome, event.id,
    event.created_at, submission.inference_id,
    ...(scope ? [scope.householdId] : []),
  ).run();

  return json(request, env, event, 201);
}

async function handleInventoryMutation(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
  itemName: string,
  action: "edit" | "remove",
): Promise<Response> {
  const adjustment = action === "edit"
    ? AdjustInventoryItemRequestSchema.safeParse(await request.json())
    : null;
  if (adjustment && !adjustment.success) {
    return json(
      request,
      env,
      { error: "Invalid inventory adjustment", details: adjustment.error.flatten() },
      400,
    );
  }

  const values = adjustment?.success ? adjustment.data : null;
  const eventType = inventoryMutationEventType(action, values?.quantity ?? null);
  const removesItem = eventType === "item_removed";
  const adjustedValues = removesItem ? null : values;
  const event: EventRecord = {
    id: crypto.randomUUID(),
    event_type: eventType,
    item_name: itemName,
    quantity: adjustedValues?.quantity ?? null,
    unit: adjustedValues?.unit ?? null,
    location: adjustedValues?.location ?? null,
    expiration_date: adjustedValues?.expiration_date ?? null,
    low_threshold: adjustedValues?.low_threshold ?? null,
    category: removesItem
      ? null
      : adjustedValues?.category ?? "automatic",
    raw_utterance: `Inventory editor ${removesItem ? "removed" : "adjusted"} ${itemName}`,
    confidence: 1,
    source: "web",
    created_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO events (
      id, event_type, item_name, quantity, unit, location,
      expiration_date, low_threshold, category, raw_utterance, confidence, source,
      created_at, household_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.id,
    event.event_type,
    event.item_name,
    event.quantity ?? null,
    event.unit ?? null,
    event.location ?? null,
    event.expiration_date ?? null,
    event.low_threshold ?? null,
    event.category ?? null,
    event.raw_utterance,
    event.confidence,
    event.source,
    event.created_at,
    scope?.householdId ?? null,
    scope?.userId ?? null,
  ).run();
  await invalidateKitchenProjection(env, scope);

  return json(request, env, event, 201);
}

async function readInventoryAttentionAcknowledgements(
  env: Env,
  scope: ConsumerScope | null,
  projectedInventory?: InventoryItem[],
): Promise<string[]> {
  if (!scope) return [];

  const inventory =
    projectedInventory ?? (await loadKitchenProjection(env, scope)).projection.inventory;
  const currentItems = new Map(
    inventory.map((item) => [item.item_name, item]),
  );
  const result = await env.DB.prepare(
    `SELECT item_name, state_snapshot
     FROM inventory_attention_acknowledgements
     WHERE household_id = ?`,
  ).bind(scope.householdId).all<{
    item_name: string;
    state_snapshot: string;
  }>();

  return result.results.flatMap((row) => {
    const item = currentItems.get(row.item_name);
    if (
      !item ||
      !inventoryNeedsAttention(item) ||
      inventoryAttentionSnapshot(item) !== row.state_snapshot
    ) {
      return [];
    }
    return [row.item_name];
  });
}

async function acknowledgeInventoryAttention(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
  itemName: string,
): Promise<Response> {
  if (!scope) {
    return json(request, env, { error: "Household setup is required" }, 409);
  }

  const item = projectInventory(await readEvents(env, scope)).find(
    (candidate) => candidate.item_name === itemName,
  );
  if (!item) {
    return json(request, env, { error: "Inventory item not found" }, 404);
  }
  if (!inventoryNeedsAttention(item)) {
    return json(request, env, { error: "Item does not need attention" }, 409);
  }

  const acknowledgedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO inventory_attention_acknowledgements (
      household_id, item_name, state_snapshot,
      acknowledged_by_user_id, acknowledged_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(household_id, item_name) DO UPDATE SET
      state_snapshot = excluded.state_snapshot,
      acknowledged_by_user_id = excluded.acknowledged_by_user_id,
      acknowledged_at = excluded.acknowledged_at`,
  ).bind(
    scope.householdId,
    itemName,
    inventoryAttentionSnapshot(item),
    scope.userId,
    acknowledgedAt,
  ).run();

  return json(request, env, {
    item_name: itemName,
    acknowledged_at: acknowledgedAt,
  });
}

async function readFridgeSetupCompletedAt(
  env: Env,
  scope: ConsumerScope | null,
): Promise<string | null> {
  const row = scope
    ? await env.DB.prepare(
        `SELECT value FROM household_app_state
         WHERE household_id = ? AND key = ?`,
      ).bind(
        scope.householdId,
        fridgeSetupCompletedKey,
      ).first<{ value: string }>()
    : await env.DB.prepare(
        "SELECT value FROM app_state WHERE key = ?",
      ).bind(fridgeSetupCompletedKey).first<{ value: string }>();
  return row?.value ?? null;
}

async function handleFridgeSetup(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
): Promise<Response> {
  const parsed = FridgeSetupRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json(
      request,
      env,
      { error: "Invalid fridge setup", details: parsed.error.flatten() },
      400,
    );
  }

  if (await readFridgeSetupCompletedAt(env, scope)) {
    return json(request, env, { error: "Fridge setup is already complete" }, 409);
  }

  const existingEvents = await readEvents(env, scope);
  const completedAt = new Date().toISOString();
  const setupEvents = buildFridgeSetupEvents(
    parsed.data.items,
    projectInventory(existingEvents),
    completedAt,
  );
  const statements = setupEvents.map((event) =>
    env.DB.prepare(
      `INSERT INTO events (
        id, event_type, item_name, quantity, unit, location,
        expiration_date, low_threshold, raw_utterance, confidence, source, created_at,
        household_id, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.id,
      event.event_type,
      event.item_name,
      event.quantity ?? null,
      event.unit ?? null,
      event.location ?? null,
      event.expiration_date ?? null,
      event.low_threshold ?? null,
      event.raw_utterance,
      event.confidence,
      event.source,
      event.created_at,
      scope?.householdId ?? null,
      scope?.userId ?? null,
    ),
  );
  statements.push(
    scope
      ? env.DB.prepare(
          `INSERT INTO household_app_state (
            household_id, key, value, updated_at
          ) VALUES (?, ?, ?, ?)`,
        ).bind(
          scope.householdId,
          fridgeSetupCompletedKey,
          completedAt,
          completedAt,
        )
      : env.DB.prepare(
          "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)",
        ).bind(fridgeSetupCompletedKey, completedAt, completedAt),
  );
  statements.push(
    scope
      ? env.DB.prepare(
          `DELETE FROM household_app_state
           WHERE household_id = ? AND key = ?`,
        ).bind(scope.householdId, kitchenProjectionKey)
      : env.DB.prepare(
          "DELETE FROM app_state WHERE key = ?",
        ).bind(kitchenProjectionKey),
  );

  await env.DB.batch(statements);
  return json(
    request,
    env,
    {
      completed: true,
      completed_at: completedAt,
      events: setupEvents,
      inventory: projectInventory([...existingEvents, ...setupEvents]),
    },
    201,
  );
}

async function handleShoppingMutation(
  request: Request,
  env: Env,
  scope: ConsumerScope | null,
  itemName: string,
  action: "add" | "purchase" | "restore" | "delete",
  requestedContext: ShoppingItemContextRequest,
): Promise<Response> {
  const existingEvents = action === "add" ? [] : await readEvents(env, scope);
  const currentItem = action === "add"
    ? null
    : projectShoppingList(
        existingEvents,
        new Date(),
        Number.POSITIVE_INFINITY,
      ).find((item) => item.item_name === itemName) ?? null;

  if (
    action === "purchase" &&
    (!currentItem || currentItem.status !== "active")
  ) {
    return json(request, env, { error: "Active shopping item not found" }, 409);
  }
  if (
    action === "restore" &&
    (!currentItem || currentItem.status !== "purchased")
  ) {
    return json(
      request,
      env,
      { error: "Purchased shopping item not found" },
      409,
    );
  }
  if (
    action === "delete" &&
    (!currentItem || currentItem.status !== "active")
  ) {
    return json(request, env, { error: "Active shopping item not found" }, 409);
  }

  const context = currentItem
    ? {
        quantity: currentItem.quantity,
        unit: currentItem.unit,
        location: currentItem.location,
        expiration_date: currentItem.expiration_date,
      }
    : requestedContext;
  const event: EventRecord = {
    id: crypto.randomUUID(),
    event_type:
      action === "add"
        ? "item_added_to_buy"
        : action === "purchase"
        ? "shopping_item_purchased"
        : action === "restore"
        ? "shopping_item_restored"
        : "shopping_item_deleted",
    item_name: itemName,
    quantity: context.quantity,
    unit: context.unit,
    location: context.location,
    expiration_date: context.expiration_date,
    low_threshold: null,
    raw_utterance:
      action === "add"
        ? `Shopping list added ${itemName}`
        : `Shopping list ${
            action === "purchase"
              ? "purchased"
              : action === "restore"
              ? "restored"
              : "deleted"
          } ${itemName}`,
    confidence: 1,
    source: "web",
    created_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO events (
      id, event_type, item_name, quantity, unit, location,
      expiration_date, low_threshold, raw_utterance, confidence, source, created_at,
      household_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.id,
    event.event_type,
    event.item_name,
    event.quantity,
    event.unit,
    event.location,
    event.expiration_date,
    event.low_threshold ?? null,
    event.raw_utterance,
    event.confidence,
    event.source,
    event.created_at,
    scope?.householdId ?? null,
    scope?.userId ?? null,
  ).run();
  await invalidateKitchenProjection(env, scope);

  const includeProjections =
    new URL(request.url).searchParams.get("include") === "projections";
  if (action !== "add" && includeProjections) {
    const nextEvents = [...existingEvents, event];
    return json(
      request,
      env,
      {
        event,
        inventory: projectInventory(nextEvents),
        items: projectShoppingList(nextEvents),
      },
      201,
    );
  }

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
  if (url.pathname.startsWith("/households/")) {
    const identity = await authenticateRequest(request, env, {
      required: true,
      requireHousehold: false,
    });
    if (!identity) {
      throw new AuthError(401, "authentication_required", "Authentication required");
    }

    if (request.method === "GET" && url.pathname === "/households/current") {
      return json(request, env, await getCurrentHousehold(env, identity));
    }

    if (request.method === "PATCH" && url.pathname === "/households/current") {
      const body = await request.json().catch(() => null);
      const parsed = UpdateHouseholdProfileRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json(
          request,
          env,
          { error: "Invalid household profile", details: parsed.error.flatten() },
          400,
        );
      }
      return json(
        request,
        env,
        await updateHouseholdProfile(env, identity, parsed.data),
      );
    }

    if (request.method === "GET" && url.pathname === "/households/members") {
      return json(request, env, await listHouseholdMembers(env, identity));
    }

    const householdMemberPath = url.pathname.match(
      /^\/households\/members\/([^/]+)$/,
    );
    if (request.method === "DELETE" && householdMemberPath) {
      let targetUserId: string;
      try {
        targetUserId = decodeURIComponent(householdMemberPath[1]);
      } catch {
        return json(request, env, { error: "Invalid member id" }, 400);
      }
      return json(
        request,
        env,
        await removeHouseholdMember(env, identity, targetUserId),
      );
    }

    if (request.method === "POST" && url.pathname === "/households/create") {
      const body = await request.json().catch(() => null);
      const parsed = CreateHouseholdRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json(
          request,
          env,
          { error: "Invalid household", details: parsed.error.flatten() },
          400,
        );
      }
      return json(
        request,
        env,
        await createHousehold(env, identity, parsed.data),
        201,
      );
    }

    if (request.method === "POST" && url.pathname === "/households/join") {
      const body = await request.json().catch(() => null);
      const parsed = JoinHouseholdRequestSchema.safeParse(body);
      if (!parsed.success) {
        return json(
          request,
          env,
          { error: "Invalid household code request", details: parsed.error.flatten() },
          400,
        );
      }
      return json(
        request,
        env,
        await joinHousehold(env, identity, parsed.data),
        201,
      );
    }

    if (request.method === "POST" && url.pathname === "/households/join-code") {
      return json(
        request,
        env,
        await rotateHouseholdJoinCode(env, identity),
        201,
      );
    }

    if (request.method === "GET" && url.pathname === "/households/join-code") {
      return json(
        request,
        env,
        await getCurrentHouseholdJoinCode(env, identity),
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/households/join-code/revoke"
    ) {
      return json(
        request,
        env,
        await revokeHouseholdJoinCodes(env, identity),
      );
    }
  }

  let consumerScope: ConsumerScope | null = null;
  if (isConsumerPath(url.pathname)) {
    const identity = await authenticateConsumerRequest(request, env);
    if (identity) {
      if (!identity.householdId) {
        throw new AuthError(
          409,
          "household_required",
          "Household setup is required",
        );
      }
      consumerScope = {
        householdId: identity.householdId,
        userId: identity.user.id,
      };
    }
  }

  const inventoryMutation = url.pathname.match(
    /^\/inventory\/([^/]+)\/(edit|remove)$/,
  );
  const inventoryAttentionAcknowledgement = url.pathname.match(
    /^\/inventory\/([^/]+)\/attention\/acknowledge$/,
  );
  const shoppingMutation = url.pathname.match(
    /^\/shopping-list\/([^/]+)\/(add|purchase|restore|delete)$/,
  );

  if (request.method === "POST" && shoppingMutation) {
    let itemName: string;
    try {
      itemName = decodeURIComponent(shoppingMutation[1]).trim();
    } catch {
      return json(request, env, { error: "Invalid item name" }, 400);
    }
    if (!itemName) return json(request, env, { error: "Invalid item name" }, 400);
    const rawContext = await request.text();
    let contextPayload: unknown = {};
    try {
      contextPayload = rawContext ? JSON.parse(rawContext) : {};
    } catch {
      return json(request, env, { error: "Invalid shopping item context" }, 400);
    }
    const parsedContext =
      ShoppingItemContextRequestSchema.safeParse(contextPayload);
    if (!parsedContext.success) {
      return json(
        request,
        env,
        {
          error: "Invalid shopping item context",
          details: parsedContext.error.flatten(),
        },
        400,
      );
    }
    return handleShoppingMutation(
      request,
      env,
      consumerScope,
      itemName,
      shoppingMutation[2] as "add" | "purchase" | "restore" | "delete",
      parsedContext.data,
    );
  }

  if (request.method === "POST" && inventoryMutation) {
    let itemName: string;
    try {
      itemName = decodeURIComponent(inventoryMutation[1]).trim();
    } catch {
      return json(request, env, { error: "Invalid item name" }, 400);
    }
    if (!itemName) return json(request, env, { error: "Invalid item name" }, 400);
    return handleInventoryMutation(
      request,
      env,
      consumerScope,
      itemName,
      inventoryMutation[2] as "edit" | "remove",
    );
  }

  if (
    request.method === "POST" &&
    inventoryAttentionAcknowledgement
  ) {
    let itemName: string;
    try {
      itemName = decodeURIComponent(
        inventoryAttentionAcknowledgement[1],
      ).trim();
    } catch {
      return json(request, env, { error: "Invalid item name" }, 400);
    }
    if (!itemName) {
      return json(request, env, { error: "Invalid item name" }, 400);
    }
    return acknowledgeInventoryAttention(
      request,
      env,
      consumerScope,
      itemName,
    );
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return json(request, env, { status: "ok" });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/commands/interpret"
  ) {
    return handleInterpret(request, env, consumerScope);
  }

  if (request.method === "POST" && url.pathname === "/events") {
    return handleCreateEvent(request, env, consumerScope);
  }

  if (request.method === "GET" && url.pathname === "/fridge-setup/status") {
    const completedAt = await readFridgeSetupCompletedAt(env, consumerScope);
    return json(request, env, {
      completed: completedAt !== null,
      completed_at: completedAt,
    });
  }

  if (request.method === "POST" && url.pathname === "/fridge-setup") {
    return handleFridgeSetup(request, env, consumerScope);
  }

  if (request.method === "POST" && url.pathname === "/inferences/outcome") {
    return handleInferenceOutcome(request, env, consumerScope);
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
    const since = url.searchParams.get("since");
    if (since && Number.isNaN(Date.parse(since))) {
      return json(request, env, { error: "Invalid since timestamp." }, 400);
    }
    return json(request, env, {
      events: await readEvents(
        env,
        consumerScope,
        since ? undefined : 50,
        since ? new Date(since).toISOString() : undefined,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/dashboard") {
    const [loadedProjection, completedAt] = await Promise.all([
      loadKitchenProjection(env, consumerScope),
      readFridgeSetupCompletedAt(env, consumerScope),
    ]);
    const recentEvents = loadedProjection.sourceEvents
      ? loadedProjection.sourceEvents.slice(-50).reverse()
      : await readEvents(env, consumerScope, 50);
    const { inventory, shoppingList } = loadedProjection.projection;
    return json(request, env, {
      inventory,
      events: recentEvents,
      shopping_list: shoppingList,
      fridge_setup: {
        completed: completedAt !== null,
        completed_at: completedAt,
      },
      acknowledged_attention_items:
        await readInventoryAttentionAcknowledgements(
          env,
          consumerScope,
          inventory,
        ),
    });
  }

  if (request.method === "GET" && url.pathname === "/inventory") {
    return json(request, env, {
      inventory:
        (await loadKitchenProjection(env, consumerScope)).projection.inventory,
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/inventory/attention-acknowledgements"
  ) {
    return json(request, env, {
      item_names: await readInventoryAttentionAcknowledgements(
        env,
        consumerScope,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/shopping-list") {
    return json(request, env, {
      items:
        (await loadKitchenProjection(env, consumerScope)).projection.shoppingList,
    });
  }

  return json(request, env, { error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof AuthError) {
        return json(
          request,
          env,
          { error: error.message, code: error.code },
          error.status,
        );
      }
      if (error instanceof HouseholdError) {
        return json(
          request,
          env,
          { error: error.message, code: error.code },
          error.status,
        );
      }
      console.error(error);
      return json(request, env, { error: "Internal server error" }, 500);
    }
  },
};
