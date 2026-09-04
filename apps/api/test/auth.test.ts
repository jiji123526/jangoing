import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AuthError,
  authenticateRequest,
  authenticateConsumerRequest,
  isAuthRequired,
  isConsumerPath,
  verifyAppJwt,
  type AuthEnvironment,
} from "../src/auth";

const secret = "test-secret-that-is-not-used-in-production";
const issuer = "jangoing-web";
const audience = "jangoing-api";
const now = new Date("2026-09-02T12:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function signToken(
  overrides: Record<string, unknown> = {},
  signingSecret = secret,
): Promise<string> {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: "google-subject-1",
    email: "user@example.com",
    name: "Test User",
    picture: "https://example.com/avatar.png",
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + 600,
    ...overrides,
  });
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
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

function environment(overrides: Partial<AuthEnvironment> = {}): AuthEnvironment {
  return {
    DB: {} as D1Database,
    APP_JWT_SECRET: secret,
    APP_JWT_ISSUER: issuer,
    APP_JWT_AUDIENCE: audience,
    ...overrides,
  };
}

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let parameters: SQLInputValue[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values as SQLInputValue[];
          return statement;
        },
        async first<T>() {
          return (database.prepare(query).get(...parameters) as T | undefined) ?? null;
        },
        async all<T>() {
          return {
            results: database.prepare(query).all(...parameters) as T[],
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("app JWT verification", () => {
  it("accepts a correctly signed, short-lived token", async () => {
    const claims = await verifyAppJwt(await signToken(), environment(), now);

    expect(claims).toMatchObject({
      sub: "google-subject-1",
      email: "user@example.com",
      iss: issuer,
      aud: audience,
    });
  });

  it.each([
    [{ iss: "wrong-issuer" }, secret],
    [{ aud: "wrong-audience" }, secret],
    [{ exp: nowSeconds }, secret],
    [{ iat: nowSeconds + 60, exp: nowSeconds + 660 }, secret],
    [{ exp: nowSeconds + 901 }, secret],
    [{}, "wrong-signing-secret"],
  ])("rejects invalid token claims or signatures", async (claims, signingSecret) => {
    await expect(
      verifyAppJwt(await signToken(claims, signingSecret), environment(), now),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_token",
    });
  });

  it("rejects unsupported JWT algorithms before signature verification", async () => {
    const token = await signToken();
    const [, payload, signature] = token.split(".");
    const unsupportedHeader = encode({ alg: "none", typ: "JWT" });

    await expect(
      verifyAppJwt(
        `${unsupportedHeader}.${payload}.${signature}`,
        environment(),
        now,
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("consumer auth boundary", () => {
  it("recognizes consumer routes without protecting health or annotations", () => {
    expect(isConsumerPath("/events")).toBe(true);
    expect(isConsumerPath("/inventory/milk/edit")).toBe(true);
    expect(isConsumerPath("/dashboard")).toBe(true);
    expect(isConsumerPath("/shopping-list/milk/purchase")).toBe(true);
    expect(isConsumerPath("/fridge-setup/status")).toBe(true);
    expect(isConsumerPath("/health")).toBe(false);
    expect(isConsumerPath("/annotations/queue")).toBe(false);
  });

  it("treats auth as optional unless explicitly enabled", () => {
    expect(isAuthRequired(environment())).toBe(false);
    expect(isAuthRequired(environment({ AUTH_REQUIRED: "TRUE" }))).toBe(true);
  });

  it("allows an anonymous request while rollout auth is disabled", async () => {
    await expect(
      authenticateConsumerRequest(
        new Request("https://api.example.com/inventory"),
        environment({ AUTH_REQUIRED: "false" }),
      ),
    ).resolves.toBeNull();
  });

  it("rejects a missing token while auth is required", async () => {
    await expect(
      authenticateConsumerRequest(
        new Request("https://api.example.com/inventory"),
        environment({ AUTH_REQUIRED: "true" }),
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "authentication_required",
    });
  });

  it("rejects malformed Authorization headers even during rollout", async () => {
    await expect(
      authenticateConsumerRequest(
        new Request("https://api.example.com/inventory", {
          headers: { Authorization: "Basic credentials" },
        }),
        environment({ AUTH_REQUIRED: "false" }),
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_authorization",
    });
  });

  it("upserts one Google identity and resolves its household membership", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    for (const name of [
      "0001_create_events.sql",
      "0003_create_inference_logs.sql",
      "0012_add_household_ownership.sql",
    ]) {
      database.exec(
        readFileSync(resolve(import.meta.dirname, `../migrations/${name}`), "utf8"),
      );
    }
    const env = environment({
      DB: sqliteD1(database),
      AUTH_REQUIRED: "false",
    });
    const requestNow = Math.floor(Date.now() / 1000);
    const token = await signToken({
      iat: requestNow,
      exp: requestNow + 600,
    });
    const request = new Request("https://api.example.com/inventory", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const firstIdentity = await authenticateRequest(request, env, {
      required: true,
      requireHousehold: false,
    });
    expect(firstIdentity).toMatchObject({
      householdId: null,
      role: null,
      user: {
        googleSubject: "google-subject-1",
        email: "user@example.com",
      },
    });

    await expect(
      authenticateConsumerRequest(request, env),
    ).rejects.toMatchObject({
      status: 409,
      code: "household_required",
    });

    const userId = firstIdentity?.user.id;
    if (!userId) throw new Error("Expected an authenticated user");
    const createdAt = "2026-09-02T12:00:00.000Z";
    database.prepare(
      `INSERT INTO households (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run("household-1", "Home", createdAt, createdAt);
    database.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      ) VALUES (?, ?, ?, ?)`,
    ).run("household-1", userId, "owner", createdAt);

    const resolvedIdentity = await authenticateConsumerRequest(request, {
      ...env,
      AUTH_REQUIRED: "true",
    });
    expect(resolvedIdentity).toMatchObject({
      householdId: "household-1",
      role: "owner",
      user: { id: userId },
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM users").get(),
    ).toEqual({ count: 1 });
    const changesBeforeRepeat = database.prepare(
      "SELECT total_changes() AS count",
    ).get();
    await authenticateConsumerRequest(request, {
      ...env,
      AUTH_REQUIRED: "true",
    });
    expect(
      database.prepare("SELECT total_changes() AS count").get(),
    ).toEqual(changesBeforeRepeat);

    database.close();
  });
});
