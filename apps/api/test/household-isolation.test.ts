import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";

interface TestStatement {
  query: string;
  parameters: SQLInputValue[];
}

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      const state: TestStatement = { query, parameters: [] };
      const statement = {
        query,
        parameters: state.parameters,
        bind(...values: unknown[]) {
          state.parameters = values as SQLInputValue[];
          statement.parameters = state.parameters;
          return statement;
        },
        async first<T>() {
          return (
            (database.prepare(query).get(...state.parameters) as T | undefined) ??
            null
          );
        },
        async all<T>() {
          return {
            results: database.prepare(query).all(...state.parameters) as T[],
          };
        },
        async run() {
          const result = database.prepare(query).run(...state.parameters);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]) {
      database.exec("BEGIN");
      try {
        const results = statements.map((rawStatement) => {
          const statement = rawStatement as unknown as TestStatement;
          const result = database
            .prepare(statement.query)
            .run(...statement.parameters);
          return { meta: { changes: Number(result.changes) } };
        });
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

const jwtSecret = "test-app-jwt-secret";
const jwtIssuer = "jangoing-web";
const jwtAudience = "jangoing-api";

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function appToken(subject: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: subject,
    email,
    iss: jwtIssuer,
    aud: jwtAudience,
    iat: now,
    exp: now + 600,
  });
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)),
  );
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  const encodedSignature = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${input}.${encodedSignature}`;
}

describe("household consumer-data isolation", () => {
  let database: DatabaseSync;
  let env: {
    DB: D1Database;
    AUTH_REQUIRED: string;
    APP_JWT_SECRET: string;
    APP_JWT_ISSUER: string;
    APP_JWT_AUDIENCE: string;
  };
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const userC = "33333333-3333-4333-8333-333333333333";
  const householdA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const householdB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const createdAt = "2026-09-02T12:00:00.000Z";

  beforeEach(async () => {
    database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    for (const name of [
      "0001_create_events.sql",
      "0002_create_corrections.sql",
      "0003_create_inference_logs.sql",
      "0009_add_inventory_low_threshold.sql",
      "0010_create_app_state.sql",
      "0011_add_inventory_category.sql",
      "0012_add_household_ownership.sql",
      "0013_enforce_single_household_membership.sql",
      "0014_add_household_profile.sql",
      "0015_store_household_join_code_ciphertext.sql",
      "0016_create_inventory_attention_acknowledgements.sql",
    ]) {
      database.exec(
        readFileSync(resolve(import.meta.dirname, `../migrations/${name}`), "utf8"),
      );
    }
    env = {
      DB: sqliteD1(database),
      AUTH_REQUIRED: "false",
      APP_JWT_SECRET: jwtSecret,
      APP_JWT_ISSUER: jwtIssuer,
      APP_JWT_AUDIENCE: jwtAudience,
    };

    const insertUser = database.prepare(
      `INSERT INTO users (
        id, google_subject, email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    );
    insertUser.run(userA, "google-a", "a@example.com", createdAt, createdAt);
    insertUser.run(userB, "google-b", "b@example.com", createdAt, createdAt);
    insertUser.run(userC, "google-c", "c@example.com", createdAt, createdAt);
    const insertHousehold = database.prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    );
    insertHousehold.run(householdA, "Home A", createdAt, createdAt);
    insertHousehold.run(householdB, "Home B", createdAt, createdAt);
    const insertMembership = database.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      ) VALUES (?, ?, 'owner', ?)`,
    );
    insertMembership.run(householdA, userA, createdAt);
    insertMembership.run(householdB, userB, createdAt);
    database.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      ) VALUES (?, ?, 'member', ?)`,
    ).run(householdA, userC, createdAt);

    const insertEvent = database.prepare(
      `INSERT INTO events (
        id, event_type, item_name, quantity, raw_utterance, confidence,
        source, created_at, household_id, created_by_user_id
      ) VALUES (?, 'item_added', ?, 1, ?, 1, 'web', ?, ?, ?)`,
    );
    insertEvent.run(crypto.randomUUID(), "milk", "Added milk", createdAt, householdA, userA);
    insertEvent.run(crypto.randomUUID(), "egg", "Added egg", createdAt, householdB, userB);
    insertEvent.run(crypto.randomUUID(), "bread", "Added bread", createdAt, null, null);

    tokenA = await appToken("google-a", "a@example.com");
    tokenB = await appToken("google-b", "b@example.com");
    tokenC = await appToken("google-c", "c@example.com");
  });

  afterEach(() => {
    database.close();
  });

  async function request(
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    return worker.fetch(
      new Request(`https://api.example.com${path}`, { ...init, headers }),
      env,
    );
  }

  it("returns only the authenticated household and isolates anonymous legacy data", async () => {
    const responseA = await request("/inventory", {}, tokenA);
    const responseB = await request("/inventory", {}, tokenB);
    const legacyResponse = await request("/inventory");

    expect(await responseA.json()).toMatchObject({
      inventory: [{ item_name: "milk" }],
    });
    expect(await responseB.json()).toMatchObject({
      inventory: [{ item_name: "egg" }],
    });
    expect(await legacyResponse.json()).toMatchObject({
      inventory: [{ item_name: "bread" }],
    });
  });

  it("stamps authenticated mutations with household and user ownership", async () => {
    const response = await request(
      "/inventory/milk/edit",
      {
        method: "POST",
        body: JSON.stringify({
          quantity: 2,
          unit: "carton",
          location: "fridge",
          expiration_date: null,
          low_threshold: 1,
          category: "dairy_eggs",
        }),
      },
      tokenA,
    );

    expect(response.status).toBe(201);
    const row = database.prepare(
      `SELECT household_id, created_by_user_id
       FROM events
       WHERE event_type = 'item_adjusted'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get();
    expect(row).toEqual({
      household_id: householdA,
      created_by_user_id: userA,
    });
  });

  it("allows regular members to edit shared inventory and shopping", async () => {
    const inventoryEdit = await request(
      "/inventory/milk/edit",
      {
        method: "POST",
        body: JSON.stringify({
          quantity: 3,
          unit: "carton",
          location: "fridge",
          expiration_date: null,
          low_threshold: 1,
          category: "dairy_eggs",
        }),
      },
      tokenC,
    );
    expect(inventoryEdit.status).toBe(201);

    const shoppingAdd = await request(
      "/shopping-list/coffee/add",
      {
        method: "POST",
        body: JSON.stringify({
          quantity: 1,
          unit: null,
          location: "pantry",
          expiration_date: null,
        }),
      },
      tokenC,
    );
    expect(shoppingAdd.status).toBe(201);

    const rows = database.prepare(
      `SELECT event_type, household_id, created_by_user_id
       FROM events
       WHERE created_by_user_id = ?
       ORDER BY created_at, event_type`,
    ).all(userC);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      {
        event_type: "item_adjusted",
        household_id: householdA,
        created_by_user_id: userC,
      },
      {
        event_type: "item_added_to_buy",
        household_id: householdA,
        created_by_user_id: userC,
      },
    ]));
  });

  it("shares attention acknowledgements and resets them when item state changes", async () => {
    const markOut = await request(
      "/inventory/milk/edit",
      {
        method: "POST",
        body: JSON.stringify({
          quantity: 0,
          unit: "carton",
          location: "fridge",
          expiration_date: null,
          low_threshold: 1,
          category: "dairy_eggs",
        }),
      },
      tokenA,
    );
    expect(markOut.status).toBe(201);

    const acknowledged = await request(
      "/inventory/milk/attention/acknowledge",
      { method: "POST" },
      tokenA,
    );
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toMatchObject({ item_name: "milk" });

    const memberView = await request(
      "/inventory/attention-acknowledgements",
      {},
      tokenC,
    );
    expect(await memberView.json()).toEqual({ item_names: ["milk"] });

    const otherHouseholdView = await request(
      "/inventory/attention-acknowledgements",
      {},
      tokenB,
    );
    expect(await otherHouseholdView.json()).toEqual({ item_names: [] });

    const changed = await request(
      "/inventory/milk/edit",
      {
        method: "POST",
        body: JSON.stringify({
          quantity: 1,
          unit: "carton",
          location: "fridge",
          expiration_date: null,
          low_threshold: 1,
          category: "dairy_eggs",
        }),
      },
      tokenC,
    );
    expect(changed.status).toBe(201);

    const resetView = await request(
      "/inventory/attention-acknowledgements",
      {},
      tokenA,
    );
    expect(await resetView.json()).toEqual({ item_names: [] });
  });

  it("lists only household members and permits only owner removal", async () => {
    const memberList = await request("/households/members", {}, tokenC);
    expect(memberList.status).toBe(200);
    expect(await memberList.json()).toMatchObject({
      members: [
        { id: userA, role: "owner" },
        { id: userC, role: "member" },
      ],
    });

    const denied = await request(
      `/households/members/${userA}`,
      { method: "DELETE" },
      tokenC,
    );
    expect(denied.status).toBe(403);

    const removed = await request(
      `/households/members/${userC}`,
      { method: "DELETE" },
      tokenA,
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      success: true,
      removed_user_id: userC,
    });
  });

  it("allows only owners to update shared household profile metadata", async () => {
    const update = {
      name: "Shared Kitchen",
      profile_emoji: "🥑",
      icon_color: "#336699",
    };
    const invalidEmoji = await request(
      "/households/current",
      {
        method: "PATCH",
        body: JSON.stringify({ ...update, profile_emoji: "avocado" }),
      },
      tokenA,
    );
    expect(invalidEmoji.status).toBe(400);

    const denied = await request(
      "/households/current",
      { method: "PATCH", body: JSON.stringify(update) },
      tokenC,
    );
    expect(denied.status).toBe(403);

    const updated = await request(
      "/households/current",
      { method: "PATCH", body: JSON.stringify(update) },
      tokenA,
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ household: update });

    const memberView = await request("/households/current", {}, tokenC);
    expect(memberView.status).toBe(200);
    expect(await memberView.json()).toMatchObject({ household: update });
  });

  it("prevents another household from resolving an inference", async () => {
    const interpreted = await request(
      "/commands/interpret",
      { method: "POST", body: JSON.stringify({ text: "We need milk" }) },
      tokenA,
    );
    const interpretation = await interpreted.json() as { inference_id: string };
    expect(
      database.prepare(
        "SELECT household_id, user_id FROM inference_logs WHERE id = ?",
      ).get(interpretation.inference_id),
    ).toEqual({ household_id: householdA, user_id: userA });

    const wrongHousehold = await request(
      "/inferences/outcome",
      {
        method: "POST",
        body: JSON.stringify({
          inference_id: interpretation.inference_id,
          outcome: "cancelled",
        }),
      },
      tokenB,
    );
    expect(wrongHousehold.status).toBe(404);

    const correctHousehold = await request(
      "/inferences/outcome",
      {
        method: "POST",
        body: JSON.stringify({
          inference_id: interpretation.inference_id,
          outcome: "cancelled",
        }),
      },
      tokenA,
    );
    expect(correctHousehold.status).toBe(200);
  });

  it("keeps fridge setup state independent per household and legacy mode", async () => {
    database.prepare(
      `INSERT INTO household_app_state (
        household_id, key, value, updated_at
      ) VALUES (?, 'fridge_setup_completed_at', ?, ?)`,
    ).run(householdA, createdAt, createdAt);
    database.prepare(
      `INSERT INTO app_state (key, value, updated_at)
       VALUES ('fridge_setup_completed_at', ?, ?)`,
    ).run("2026-09-01T12:00:00.000Z", createdAt);

    const statusA = await request("/fridge-setup/status", {}, tokenA);
    const statusB = await request("/fridge-setup/status", {}, tokenB);
    const legacyStatus = await request("/fridge-setup/status");

    expect(await statusA.json()).toMatchObject({ completed: true });
    expect(await statusB.json()).toEqual({
      completed: false,
      completed_at: null,
    });
    expect(await legacyStatus.json()).toMatchObject({ completed: true });
  });
});
