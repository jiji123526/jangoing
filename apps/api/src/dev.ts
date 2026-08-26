import {
  CreateEventRequestSchema,
  EventRecordSchema,
  InterpretCommandRequestSchema,
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
import { projectInventory, projectShoppingList } from "./domain/projections";
import { parseCommand } from "./nlp/parse-command";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath =
  process.env.LOCAL_DB_PATH ?? resolve(apiDirectory, ".local/jangoing.sqlite");
const migrationPath = resolve(
  apiDirectory,
  "migrations/0001_create_events.sql",
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

    sendJson(response, origin, parseCommand(parsed.data));
    return;
  }

  if (request.method === "POST" && path === "/events") {
    const parsed = CreateEventRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) {
      sendJson(
        response,
        origin,
        { error: "Invalid event", details: parsed.error.flatten() },
        400,
      );
      return;
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
