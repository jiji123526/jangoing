import {
  AnnotationAssistantProposalRequestSchema,
  AnnotationAssistantProposalSchema,
  AnnotationNormalizedValuesResponseSchema,
  AdjustInventoryItemRequestSchema,
  ConfirmActionRequestSchema,
  CreateAnnotationRequestSchema,
  EventRecordSchema,
  FridgeSetupRequestSchema,
  InterpretationSchema,
  InterpretCommandRequestSchema,
  ShoppingItemContextRequestSchema,
  UpdateInferenceOutcomeRequestSchema,
  type EventRecord,
  type Interpretation,
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
const annotationProposalsMigrationPath = resolve(
  apiDirectory,
  "migrations/0006_create_annotation_proposals.sql",
);
const annotationAiUsageMigrationPath = resolve(
  apiDirectory,
  "migrations/0007_log_annotation_ai_usage.sql",
);
const annotationRelevanceMigrationPath = resolve(
  apiDirectory,
  "migrations/0008_add_annotation_relevance.sql",
);
const inventoryLowThresholdMigrationPath = resolve(
  apiDirectory,
  "migrations/0009_add_inventory_low_threshold.sql",
);
const appStateMigrationPath = resolve(
  apiDirectory,
  "migrations/0010_create_app_state.sql",
);
const inventoryCategoryMigrationPath = resolve(
  apiDirectory,
  "migrations/0011_add_inventory_category.sql",
);
const householdOwnershipMigrationPath = resolve(
  apiDirectory,
  "migrations/0012_add_household_ownership.sql",
);
const singleHouseholdMembershipMigrationPath = resolve(
  apiDirectory,
  "migrations/0013_enforce_single_household_membership.sql",
);
const householdProfileMigrationPath = resolve(
  apiDirectory,
  "migrations/0014_add_household_profile.sql",
);
const householdJoinCodeCiphertextMigrationPath = resolve(
  apiDirectory,
  "migrations/0015_store_household_join_code_ciphertext.sql",
);
const port = Number(process.env.PORT ?? 8787);

function defaultAllowedOrigins(): string[] {
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const devspaceId = process.env.DEVSPACE_ID?.trim();

  if (!devspaceId) {
    return defaults;
  }

  try {
    const proxyBaseDomain = readFileSync(
      "/etc/devspace/http-proxy-base-domain",
      "utf8",
    ).trim();

    if (!proxyBaseDomain) {
      return defaults;
    }

    return [...defaults, `https://${devspaceId}--3000.${proxyBaseDomain}`];
  } catch {
    return defaults;
  }
}

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS?.split(",") ?? defaultAllowedOrigins()
).map((origin) => origin.trim());

mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
const migration = readFileSync(migrationPath, "utf8")
  .replace("CREATE TABLE events", "CREATE TABLE IF NOT EXISTS events")
  .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
database.exec(migration);
const eventColumns = database.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
if (!eventColumns.some((column) => column.name === "low_threshold")) {
  database.exec(readFileSync(inventoryLowThresholdMigrationPath, "utf8"));
}
if (!eventColumns.some((column) => column.name === "category")) {
  database.exec(readFileSync(inventoryCategoryMigrationPath, "utf8"));
}
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
if (!annotationColumns.some((column) => column.name === "relevance")) {
  database.exec(readFileSync(annotationRelevanceMigrationPath, "utf8"));
}
const proposalTable = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'annotation_proposals'",
).get() as { name?: string } | undefined;
if (!proposalTable?.name) {
  database.exec(readFileSync(annotationProposalsMigrationPath, "utf8"));
}
const proposalColumns = database.prepare("PRAGMA table_info(annotation_proposals)").all() as Array<{ name: string }>;
if (!proposalColumns.some((column) => column.name === "input_tokens")) {
  database.exec(readFileSync(annotationAiUsageMigrationPath, "utf8"));
}
const appStateTable = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state'",
).get() as { name?: string } | undefined;
if (!appStateTable?.name) {
  database.exec(readFileSync(appStateMigrationPath, "utf8"));
}
const usersTable = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
).get() as { name?: string } | undefined;
if (!usersTable?.name) {
  database.exec(readFileSync(householdOwnershipMigrationPath, "utf8"));
}
const singleHouseholdMembershipIndex = database.prepare(
  `SELECT name FROM sqlite_master
   WHERE type = 'index' AND name = 'idx_household_memberships_one_per_user'`,
).get() as { name?: string } | undefined;
if (!singleHouseholdMembershipIndex?.name) {
  database.exec(readFileSync(singleHouseholdMembershipMigrationPath, "utf8"));
}
const householdColumns = database.prepare(
  "PRAGMA table_info(households)",
).all() as Array<{ name: string }>;
if (!householdColumns.some((column) => column.name === "profile_emoji")) {
  database.exec(readFileSync(householdProfileMigrationPath, "utf8"));
}
const householdJoinCodeColumns = database.prepare(
  "PRAGMA table_info(household_join_codes)",
).all() as Array<{ name: string }>;
if (!householdJoinCodeColumns.some((column) => column.name === "code_ciphertext")) {
  database.exec(readFileSync(householdJoinCodeCiphertextMigrationPath, "utf8"));
}
const parserVersion = "rules-v2";
const normalizerVersion = "normalizers-v1";
const schemaVersion = "inference-v1";
const annotationSchemaVersion = "annotation-v3";

function parseStoredInterpretation(payload: string): Interpretation {
  return InterpretationSchema.parse(JSON.parse(payload));
}

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

function events(limit?: number, since?: string): EventRecord[] {
  const query = since
    ? "SELECT * FROM events WHERE created_at >= ? ORDER BY created_at DESC, id DESC"
    : limit
      ? "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?"
      : "SELECT * FROM events ORDER BY created_at ASC, id ASC";
  const rows = since
    ? database.prepare(query).all(since)
    : limit
      ? database.prepare(query).all(limit)
      : database.prepare(query).all();

  return rows.map((row) => EventRecordSchema.parse(row));
}

function responseHeaders(origin?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    sendJson(response, origin, { status: "ok" });
    return;
  }

  if (request.method === "POST" && path === "/commands/interpret") {
    const receivedAt = new Date();
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

    const temporalContext = resolveTemporalGrounding(parsed.data, receivedAt);
    const result = parseCommand({ ...parsed.data, ...temporalContext });
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
      JSON.stringify({
        expiration_date: parsed.data.expiration_date ?? null,
        reference_date: temporalContext.reference_date,
        timezone: temporalContext.timezone,
        conversation_id: parsed.data.conversation_id ?? null,
        turn_index: parsed.data.turn_index ?? null,
        speaker_role: parsed.data.speaker_role ?? null,
        activation_mode: parsed.data.activation_mode ?? null,
      }),
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

  if (request.method === "GET" && path === "/annotations/normalized-values") {
    const rows = database.prepare(
      "SELECT actions, entities FROM annotations ORDER BY created_at ASC, id ASC",
    ).all() as unknown as AnnotationNormalizedValueRow[];
    sendJson(
      response,
      origin,
      AnnotationNormalizedValuesResponseSchema.parse(
        collectAnnotationNormalizedValues(rows),
      ),
    );
    return;
  }

  if (request.method === "POST" && path === "/annotations/proposal") {
    const parsed = AnnotationAssistantProposalRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(response, origin, { error: "Invalid annotation proposal request" }, 400);
      return;
    }
    const inference = database.prepare(
      `SELECT raw_utterance, predicted_interpretation, request_context, created_at
       FROM inference_logs WHERE id = ?`,
    ).get(parsed.data.inference_id) as {
      raw_utterance: string;
      predicted_interpretation: string;
      request_context: string | null;
      created_at: string;
    } | undefined;
    if (!inference) {
      sendJson(response, origin, { error: "Inference not found" }, 404);
      return;
    }

    const monthlyBudget = Number(process.env.OPENAI_MONTHLY_BUDGET_USD ?? "5");
    if (process.env.OPENAI_API_KEY && Number.isFinite(monthlyBudget) && monthlyBudget > 0) {
      const usage = database.prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
         FROM annotation_proposals
         WHERE created_at >= datetime('now', 'start of month')`,
      ).get() as { total: number };
      if (usage.total >= monthlyBudget) {
        sendJson(response, origin, { error: "Monthly annotation AI budget reached" }, 429);
        return;
      }
    }

    const normalizedValueRows = database.prepare(
      "SELECT actions, entities FROM annotations ORDER BY created_at ASC, id ASC",
    ).all() as unknown as AnnotationNormalizedValueRow[];

    const generated = await buildAnnotationAssistantProposal(process.env, {
      inference_id: parsed.data.inference_id,
      raw_utterance: inference.raw_utterance,
      predicted_interpretation: parseStoredInterpretation(inference.predicted_interpretation),
      temporal_context: resolveStoredTemporalGrounding(
        inference.request_context,
        inference.created_at,
      ),
      preferred_normalized_values: collectAnnotationNormalizedValues(normalizedValueRows),
    });
    const { usage, ...proposalDraft } = generated;
    const createdAt = new Date().toISOString();
    const proposal = AnnotationAssistantProposalSchema.parse({
      proposal_id: crypto.randomUUID(),
      inference_id: parsed.data.inference_id,
      ...proposalDraft,
      created_at: createdAt,
    });
    database.prepare(
      `INSERT INTO annotation_proposals (
        id, inference_id, provider, model, prompt_version, proposal,
        note, input_tokens, output_tokens, estimated_cost_usd, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
    ).run(
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
    );
    sendJson(response, origin, proposal, 201);
    return;
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
    if (parsed.data.assistant_proposal_id) {
      const proposal = database.prepare(
        "SELECT id, applied_annotation_id FROM annotation_proposals WHERE id = ? AND inference_id = ?",
      ).get(
        parsed.data.assistant_proposal_id,
        parsed.data.inference_id,
      ) as { id: string; applied_annotation_id: string | null } | undefined;
      if (!proposal) {
        sendJson(response, origin, { error: "Assistant proposal not found" }, 400);
        return;
      }
      if (proposal.applied_annotation_id) {
        sendJson(response, origin, { error: "Assistant proposal is already linked to an annotation" }, 409);
        return;
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
      database.exec("BEGIN");
      database.prepare(
        `INSERT INTO annotations (
          id, inference_id, intent, entities, normalized, dataset_purpose,
          phrase_family, notes, annotator, annotation_schema_version, created_at,
          actions, relevance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        annotationId, parsed.data.inference_id, legacyAction.intent,
        JSON.stringify(legacyAction.entities), JSON.stringify(legacyAction.normalized),
        parsed.data.dataset_purpose, legacyAction.phrase_family ?? null,
        parsed.data.notes ?? null, parsed.data.annotator, annotationSchemaVersion,
        createdAt, JSON.stringify(enrichedActions), relevance,
      );
      database.prepare(
        `UPDATE inference_logs SET outcome = 'annotated', corrected_interpretation = ?,
         resolved_at = ? WHERE id = ?`,
      ).run(
        JSON.stringify({ relevance, actions: enrichedActions }),
        createdAt, parsed.data.inference_id,
      );
      if (parsed.data.assistant_proposal_id && parsed.data.assistant_resolution) {
        database.prepare(
          `UPDATE annotation_proposals
           SET status = 'applied', resolution = ?, applied_annotation_id = ?, applied_at = ?
           WHERE id = ? AND inference_id = ?`,
        ).run(
          parsed.data.assistant_resolution,
          annotationId,
          createdAt,
          parsed.data.assistant_proposal_id,
          parsed.data.inference_id,
        );
      }
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
      low_threshold: submission.event.low_threshold ?? null,
      created_at: new Date().toISOString(),
    };

    database
      .prepare(
        `INSERT INTO events (
          id, event_type, item_name, quantity, unit, location,
          expiration_date, low_threshold, raw_utterance, confidence, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );

    const intentByEventType = {
      item_added: "add_item",
      item_consumed: "consume_item",
      item_marked_low: "mark_low",
      item_marked_out: "mark_out",
      item_thrown_away: "throw_away",
      item_added_to_buy: "add_to_buy",
      item_low_threshold_set: "set_low_threshold",
    } as const;
    const predicted = {
      intent: submission.original_interpretation.intent,
      slots: submission.original_interpretation.slots,
    };
    const corrected = {
      intent: Object.entries(intentByEventType).find(
        ([eventType]) => eventType === event.event_type,
      )?.[1],
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

  if (request.method === "GET" && path === "/dashboard") {
    const allEvents = events();
    const inventory = projectInventory(allEvents);
    const currentItems = new Map(
      inventory.map((item) => [item.item_name, item]),
    );
    const acknowledgementRows = database.prepare(
      `SELECT key, value FROM app_state
       WHERE key LIKE 'inventory_attention_ack:%'`,
    ).all() as Array<{ key: string; value: string }>;
    const acknowledgedAttentionItems = acknowledgementRows.flatMap((row) => {
      const itemName = row.key.slice("inventory_attention_ack:".length);
      const item = currentItems.get(itemName);
      return item &&
        inventoryNeedsAttention(item) &&
        inventoryAttentionSnapshot(item) === row.value
        ? [itemName]
        : [];
    });
    const setupRow = database.prepare(
      "SELECT value FROM app_state WHERE key = ?",
    ).get(fridgeSetupCompletedKey) as { value: string } | undefined;

    sendJson(response, origin, {
      inventory,
      events: allEvents.slice(-50).reverse(),
      shopping_list: projectShoppingList(allEvents),
      fridge_setup: {
        completed: setupRow !== undefined,
        completed_at: setupRow?.value ?? null,
      },
      acknowledged_attention_items: acknowledgedAttentionItems,
    });
    return;
  }

  if (request.method === "GET" && path === "/fridge-setup/status") {
    const row = database.prepare(
      "SELECT value FROM app_state WHERE key = ?",
    ).get(fridgeSetupCompletedKey) as { value: string } | undefined;
    sendJson(response, origin, {
      completed: row !== undefined,
      completed_at: row?.value ?? null,
    });
    return;
  }

  if (request.method === "POST" && path === "/fridge-setup") {
    const parsed = FridgeSetupRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(
        response,
        origin,
        { error: "Invalid fridge setup", details: parsed.error.flatten() },
        400,
      );
      return;
    }

    const completed = database.prepare(
      "SELECT value FROM app_state WHERE key = ?",
    ).get(fridgeSetupCompletedKey);
    if (completed) {
      sendJson(response, origin, { error: "Fridge setup is already complete" }, 409);
      return;
    }

    const existingEvents = events();
    const completedAt = new Date().toISOString();
    const setupEvents = buildFridgeSetupEvents(
      parsed.data.items,
      projectInventory(existingEvents),
      completedAt,
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      const insertEvent = database.prepare(
        `INSERT INTO events (
          id, event_type, item_name, quantity, unit, location,
          expiration_date, low_threshold, raw_utterance, confidence, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const event of setupEvents) {
        insertEvent.run(
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
        );
      }
      database.prepare(
        "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)",
      ).run(fridgeSetupCompletedKey, completedAt, completedAt);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    sendJson(
      response,
      origin,
      {
        completed: true,
        completed_at: completedAt,
        events: setupEvents,
        inventory: projectInventory([...existingEvents, ...setupEvents]),
      },
      201,
    );
    return;
  }

  if (request.method === "GET" && path === "/events") {
    const since = url.searchParams.get("since");
    if (since && Number.isNaN(Date.parse(since))) {
      sendJson(response, origin, { error: "Invalid since timestamp." }, 400);
      return;
    }
    sendJson(response, origin, {
      events: events(
        since ? undefined : 50,
        since ? new Date(since).toISOString() : undefined,
      ),
    });
    return;
  }

  const inventoryMutation = path.match(/^\/inventory\/([^/]+)\/(edit|remove)$/);
  const inventoryAttentionAcknowledgement = path.match(
    /^\/inventory\/([^/]+)\/attention\/acknowledge$/,
  );
  const shoppingMutation = path.match(
    /^\/shopping-list\/([^/]+)\/(add|purchase|restore|delete)$/,
  );
  if (request.method === "POST" && shoppingMutation) {
    let itemName: string;
    try {
      itemName = decodeURIComponent(shoppingMutation[1]).trim();
    } catch {
      sendJson(response, origin, { error: "Invalid item name" }, 400);
      return;
    }
    if (!itemName) {
      sendJson(response, origin, { error: "Invalid item name" }, 400);
      return;
    }

    const action = shoppingMutation[2] as
      | "add"
      | "purchase"
      | "restore"
      | "delete";
    const parsedContext = ShoppingItemContextRequestSchema.safeParse(
      (await readBody(request)) ?? {},
    );
    if (!parsedContext.success) {
      sendJson(
        response,
        origin,
        {
          error: "Invalid shopping item context",
          details: parsedContext.error.flatten(),
        },
        400,
      );
      return;
    }
    const existingEvents = action === "add" ? [] : events();
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
      sendJson(response, origin, { error: "Active shopping item not found" }, 409);
      return;
    }
    if (
      action === "restore" &&
      (!currentItem || currentItem.status !== "purchased")
    ) {
      sendJson(
        response,
        origin,
        { error: "Purchased shopping item not found" },
        409,
      );
      return;
    }
    if (
      action === "delete" &&
      (!currentItem || currentItem.status !== "active")
    ) {
      sendJson(response, origin, { error: "Active shopping item not found" }, 409);
      return;
    }
    const context = currentItem
      ? {
          quantity: currentItem.quantity,
          unit: currentItem.unit,
          location: currentItem.location,
          expiration_date: currentItem.expiration_date,
        }
      : parsedContext.data;
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
    database.prepare(
      `INSERT INTO events (
        id, event_type, item_name, quantity, unit, location,
        expiration_date, low_threshold, raw_utterance, confidence, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
    const includeProjections =
      url.searchParams.get("include") === "projections";
    if (action !== "add" && includeProjections) {
      const nextEvents = [...existingEvents, event];
      sendJson(
        response,
        origin,
        {
          event,
          inventory: projectInventory(nextEvents),
          items: projectShoppingList(nextEvents),
        },
        201,
      );
      return;
    }
    sendJson(response, origin, event, 201);
    return;
  }

  if (request.method === "POST" && inventoryMutation) {
    let itemName: string;
    try {
      itemName = decodeURIComponent(inventoryMutation[1]).trim();
    } catch {
      sendJson(response, origin, { error: "Invalid item name" }, 400);
      return;
    }
    if (!itemName) {
      sendJson(response, origin, { error: "Invalid item name" }, 400);
      return;
    }

    const action = inventoryMutation[2] as "edit" | "remove";
    const adjustment = action === "edit"
      ? AdjustInventoryItemRequestSchema.safeParse(await readBody(request))
      : null;
    if (adjustment && !adjustment.success) {
      sendJson(
        response,
        origin,
        { error: "Invalid inventory adjustment", details: adjustment.error.flatten() },
        400,
      );
      return;
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
    database.prepare(
      `INSERT INTO events (
        id, event_type, item_name, quantity, unit, location,
        expiration_date, low_threshold, category, raw_utterance, confidence, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
    sendJson(response, origin, event, 201);
    return;
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
      sendJson(response, origin, { error: "Invalid item name" }, 400);
      return;
    }
    const item = projectInventory(events()).find(
      (candidate) => candidate.item_name === itemName,
    );
    if (!item) {
      sendJson(response, origin, { error: "Inventory item not found" }, 404);
      return;
    }
    if (!inventoryNeedsAttention(item)) {
      sendJson(response, origin, { error: "Item does not need attention" }, 409);
      return;
    }

    const acknowledgedAt = new Date().toISOString();
    database.prepare(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(
      `inventory_attention_ack:${itemName}`,
      inventoryAttentionSnapshot(item),
      acknowledgedAt,
    );
    sendJson(response, origin, {
      item_name: itemName,
      acknowledged_at: acknowledgedAt,
    });
    return;
  }

  if (
    request.method === "GET" &&
    path === "/inventory/attention-acknowledgements"
  ) {
    const currentItems = new Map(
      projectInventory(events()).map((item) => [item.item_name, item]),
    );
    const rows = database.prepare(
      `SELECT key, value FROM app_state
       WHERE key LIKE 'inventory_attention_ack:%'`,
    ).all() as Array<{ key: string; value: string }>;
    const itemNames = rows.flatMap((row) => {
      const itemName = row.key.slice("inventory_attention_ack:".length);
      const item = currentItems.get(itemName);
      return item &&
        inventoryNeedsAttention(item) &&
        inventoryAttentionSnapshot(item) === row.value
        ? [itemName]
        : [];
    });
    sendJson(response, origin, { item_names: itemNames });
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
