import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RequestIdentity } from "../src/auth";
import {
  HouseholdError,
  createHousehold,
  getCurrentHousehold,
  joinHousehold,
  normalizeJoinCode,
  revokeHouseholdJoinCodes,
  rotateHouseholdJoinCode,
  type HouseholdEnvironment,
} from "../src/households";

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

function identity(
  id: string,
  householdId: string | null = null,
  role: "owner" | "member" | null = null,
): RequestIdentity {
  return {
    user: {
      id,
      googleSubject: `google-${id}`,
      email: `${id}@example.com`,
      displayName: id,
      avatarUrl: null,
    },
    householdId,
    role,
  };
}

describe("household lifecycle", () => {
  let database: DatabaseSync;
  let env: HouseholdEnvironment;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    for (const name of [
      "0001_create_events.sql",
      "0003_create_inference_logs.sql",
      "0012_add_household_ownership.sql",
      "0013_enforce_single_household_membership.sql",
    ]) {
      database.exec(
        readFileSync(resolve(import.meta.dirname, `../migrations/${name}`), "utf8"),
      );
    }
    env = {
      DB: sqliteD1(database),
      HOUSEHOLD_CODE_SECRET: "test-household-code-secret",
    };
  });

  afterEach(() => {
    database.close();
  });

  function insertUser(user: RequestIdentity): void {
    const createdAt = "2026-09-02T00:00:00.000Z";
    database.prepare(
      `INSERT INTO users (
        id, google_subject, email, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      user.user.id,
      user.user.googleSubject,
      user.user.email,
      user.user.displayName,
      createdAt,
      createdAt,
    );
  }

  it("normalizes readable codes without accepting ambiguous characters", () => {
    expect(normalizeJoinCode("abcd-efgh-jk")).toBe("ABCDEFGHJK");
    expect(normalizeJoinCode("ABCD EFGH JK")).toBe("ABCDEFGHJK");
    expect(normalizeJoinCode("ABCI-EFGH-JK")).toBeNull();
    expect(normalizeJoinCode("too-short")).toBeNull();
  });

  it("creates an owner membership and stores only the code hash", async () => {
    const owner = identity("owner-1");
    insertUser(owner);

    const created = await createHousehold(
      env,
      owner,
      { name: "Our Kitchen" },
      new Date("2026-09-02T12:00:00.000Z"),
    );

    expect(created.household).toMatchObject({
      name: "Our Kitchen",
      role: "owner",
    });
    expect(created.join_code.code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$/);
    const storedCode = database.prepare(
      "SELECT code_hash, expires_at FROM household_join_codes",
    ).get() as { code_hash: string; expires_at: string };
    expect(storedCode.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedCode.code_hash).not.toContain(
      created.join_code.code.replaceAll("-", ""),
    );
    expect(storedCode.expires_at).toBe("2026-09-09T12:00:00.000Z");

    const current = await getCurrentHousehold(
      env,
      identity("owner-1", created.household.id, "owner"),
    );
    expect(current.household).toEqual(created.household);
    expect(current.user).toEqual({
      id: "owner-1",
      email: "owner-1@example.com",
      display_name: "owner-1",
      avatar_url: null,
    });
    expect(current.user).not.toHaveProperty("googleSubject");
  });

  it("joins an existing household with a normalized valid code", async () => {
    const owner = identity("owner-1");
    const member = identity("member-1");
    insertUser(owner);
    insertUser(member);
    const created = await createHousehold(
      env,
      owner,
      { name: "Our Kitchen" },
      new Date("2026-09-02T12:00:00.000Z"),
    );

    const joined = await joinHousehold(
      env,
      member,
      { code: created.join_code.code.toLowerCase().replaceAll("-", "") },
      new Date("2026-09-02T12:01:00.000Z"),
    );

    expect(joined.household).toMatchObject({
      id: created.household.id,
      name: "Our Kitchen",
      role: "member",
    });
  });

  it("returns the same error for expired and revoked codes", async () => {
    const owner = identity("owner-1");
    const expiredMember = identity("member-expired");
    const revokedMember = identity("member-revoked");
    insertUser(owner);
    insertUser(expiredMember);
    insertUser(revokedMember);
    const created = await createHousehold(
      env,
      owner,
      { name: "Our Kitchen" },
      new Date("2026-09-02T12:00:00.000Z"),
    );

    await expect(
      joinHousehold(
        env,
        expiredMember,
        { code: created.join_code.code },
        new Date("2026-09-10T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_household_code",
    });

    await revokeHouseholdJoinCodes(
      env,
      identity("owner-1", created.household.id, "owner"),
      new Date("2026-09-03T12:00:00.000Z"),
    );
    await expect(
      joinHousehold(
        env,
        revokedMember,
        { code: created.join_code.code },
        new Date("2026-09-03T12:01:00.000Z"),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_household_code",
    });
  });

  it("rotates codes for owners and rejects member rotation", async () => {
    const owner = identity("owner-1");
    const member = identity("member-1");
    insertUser(owner);
    insertUser(member);
    const created = await createHousehold(
      env,
      owner,
      { name: "Our Kitchen" },
      new Date("2026-09-02T12:00:00.000Z"),
    );
    const ownerWithHousehold = identity(
      "owner-1",
      created.household.id,
      "owner",
    );

    const rotated = await rotateHouseholdJoinCode(
      env,
      ownerWithHousehold,
      new Date("2026-09-03T12:00:00.000Z"),
    );
    expect(rotated.join_code.code).not.toBe(created.join_code.code);
    expect(
      database.prepare(
        "SELECT COUNT(*) AS count FROM household_join_codes WHERE revoked_at IS NULL",
      ).get(),
    ).toEqual({ count: 1 });

    await expect(
      rotateHouseholdJoinCode(
        env,
        identity("member-1", created.household.id, "member"),
      ),
    ).rejects.toBeInstanceOf(HouseholdError);
  });

  it("enforces one household membership per user in the database", () => {
    const member = identity("member-1");
    insertUser(member);
    const createdAt = "2026-09-02T12:00:00.000Z";
    const insertHousehold = database.prepare(
      "INSERT INTO households (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    );
    insertHousehold.run("household-1", "One", createdAt, createdAt);
    insertHousehold.run("household-2", "Two", createdAt, createdAt);
    const insertMembership = database.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      ) VALUES (?, ?, 'member', ?)`,
    );
    insertMembership.run("household-1", member.user.id, createdAt);

    expect(() => {
      insertMembership.run("household-2", member.user.id, createdAt);
    }).toThrow();
  });
});
