import {
  CreateEventRequestSchema,
  EventRecordSchema,
  InterpretCommandRequestSchema,
  type EventRecord,
} from "@jangoing/contracts";
import { projectInventory, projectShoppingList } from "./domain/projections";
import { parseCommand } from "./nlp/parse-command";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
}

const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

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

  return json(request, env, parseCommand(parsed.data));
}

async function handleCreateEvent(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await request.json();
  const parsed = CreateEventRequestSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      request,
      env,
      { error: "Invalid event", details: parsed.error.flatten() },
      400,
    );
  }

  const event: EventRecord = {
    id: crypto.randomUUID(),
    ...parsed.data,
    quantity: parsed.data.quantity ?? null,
    unit: parsed.data.unit ?? null,
    location: parsed.data.location ?? null,
    expiration_date: parsed.data.expiration_date ?? null,
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
