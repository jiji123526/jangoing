import type {
  CreateHouseholdRequest,
  CurrentHouseholdResponse,
  HouseholdJoinCode,
  HouseholdSummary,
  JoinHouseholdRequest,
} from "@jangoing/contracts";
import type { RequestIdentity } from "./auth";

export interface HouseholdEnvironment {
  DB: D1Database;
  HOUSEHOLD_CODE_SECRET?: string;
}

interface HouseholdRow {
  id: string;
  name: string;
  role: "owner" | "member";
  created_at: string;
}

const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const joinCodeLength = 10;
const joinCodeLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

export class HouseholdError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HouseholdError";
  }
}

function requiredCodeSecret(env: HouseholdEnvironment): string {
  const secret = env.HOUSEHOLD_CODE_SECRET?.trim();
  if (!secret) {
    throw new HouseholdError(
      503,
      "household_codes_not_configured",
      "Household codes are not configured",
    );
  }
  return secret;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeJoinCode(input: string): string | null {
  const normalized = input.toUpperCase().replace(/[\s-]+/g, "");
  return normalized.length === joinCodeLength &&
    [...normalized].every((character) => joinCodeAlphabet.includes(character))
    ? normalized
    : null;
}

export function generateJoinCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(joinCodeLength));
  const normalized = Array.from(
    random,
    (byte) => joinCodeAlphabet[byte & 31],
  ).join("");
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`;
}

export async function hashJoinCode(
  code: string,
  env: HouseholdEnvironment,
): Promise<string> {
  const normalized = normalizeJoinCode(code);
  if (!normalized) {
    throw new HouseholdError(
      400,
      "invalid_household_code",
      "Invalid household code",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(requiredCodeSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(normalized)),
  );
  return bytesToHex(digest);
}

function assertNoHousehold(identity: RequestIdentity): void {
  if (identity.householdId) {
    throw new HouseholdError(
      409,
      "household_already_assigned",
      "User already belongs to a household",
    );
  }
}

function assertOwner(identity: RequestIdentity): asserts identity is RequestIdentity & {
  householdId: string;
  role: "owner";
} {
  if (!identity.householdId || identity.role !== "owner") {
    throw new HouseholdError(
      403,
      "household_owner_required",
      "Household owner access is required",
    );
  }
}

function summary(row: HouseholdRow): HouseholdSummary {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    created_at: row.created_at,
  };
}

async function readHouseholdForUser(
  env: HouseholdEnvironment,
  userId: string,
): Promise<HouseholdSummary | null> {
  const row = await env.DB.prepare(
    `SELECT h.id, h.name, hm.role, h.created_at
     FROM household_memberships hm
     JOIN households h ON h.id = hm.household_id
     WHERE hm.user_id = ?`,
  ).bind(userId).first<HouseholdRow>();
  return row ? summary(row) : null;
}

export async function getCurrentHousehold(
  env: HouseholdEnvironment,
  identity: RequestIdentity,
): Promise<CurrentHouseholdResponse> {
  return {
    user: {
      id: identity.user.id,
      email: identity.user.email,
      display_name: identity.user.displayName,
      avatar_url: identity.user.avatarUrl,
    },
    household: identity.householdId
      ? await readHouseholdForUser(env, identity.user.id)
      : null,
  };
}

function joinCodeDates(now: Date): { createdAt: string; expiresAt: string } {
  return {
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + joinCodeLifetimeMs).toISOString(),
  };
}

function isMembershipConflict(error: unknown): boolean {
  return error instanceof Error &&
    (error.message.includes("household_memberships.user_id") ||
      error.message.includes("idx_household_memberships_one_per_user"));
}

export async function createHousehold(
  env: HouseholdEnvironment,
  identity: RequestIdentity,
  input: CreateHouseholdRequest,
  now = new Date(),
): Promise<{ household: HouseholdSummary; join_code: HouseholdJoinCode }> {
  assertNoHousehold(identity);
  const householdId = crypto.randomUUID();
  const joinCodeId = crypto.randomUUID();
  const code = generateJoinCode();
  const codeHash = await hashJoinCode(code, env);
  const { createdAt, expiresAt } = joinCodeDates(now);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO households (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(householdId, input.name, createdAt, createdAt),
      env.DB.prepare(
        `INSERT INTO household_memberships (
          household_id, user_id, role, created_at
        ) VALUES (?, ?, 'owner', ?)`,
      ).bind(householdId, identity.user.id, createdAt),
      env.DB.prepare(
        `INSERT INTO household_join_codes (
          id, household_id, code_hash, created_by_user_id,
          expires_at, revoked_at, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      ).bind(
        joinCodeId,
        householdId,
        codeHash,
        identity.user.id,
        expiresAt,
        createdAt,
      ),
    ]);
  } catch (error) {
    if (isMembershipConflict(error)) {
      throw new HouseholdError(
        409,
        "household_already_assigned",
        "User already belongs to a household",
      );
    }
    throw error;
  }

  return {
    household: {
      id: householdId,
      name: input.name,
      role: "owner",
      created_at: createdAt,
    },
    join_code: { code, expires_at: expiresAt },
  };
}

export async function joinHousehold(
  env: HouseholdEnvironment,
  identity: RequestIdentity,
  input: JoinHouseholdRequest,
  now = new Date(),
): Promise<{ household: HouseholdSummary }> {
  assertNoHousehold(identity);
  const codeHash = await hashJoinCode(input.code, env);
  const createdAt = now.toISOString();

  try {
    const result = await env.DB.prepare(
      `INSERT INTO household_memberships (
        household_id, user_id, role, created_at
      )
      SELECT household_id, ?, 'member', ?
      FROM household_join_codes
      WHERE code_hash = ?
        AND revoked_at IS NULL
        AND expires_at > ?`,
    ).bind(
      identity.user.id,
      createdAt,
      codeHash,
      createdAt,
    ).run();

    if (!result.meta.changes) {
      throw new HouseholdError(
        400,
        "invalid_household_code",
        "Invalid household code",
      );
    }
  } catch (error) {
    if (error instanceof HouseholdError) throw error;
    if (isMembershipConflict(error)) {
      throw new HouseholdError(
        409,
        "household_already_assigned",
        "User already belongs to a household",
      );
    }
    throw error;
  }

  const household = await readHouseholdForUser(env, identity.user.id);
  if (!household) {
    throw new HouseholdError(
      500,
      "household_resolution_failed",
      "Unable to resolve household",
    );
  }
  return { household };
}

export async function rotateHouseholdJoinCode(
  env: HouseholdEnvironment,
  identity: RequestIdentity,
  now = new Date(),
): Promise<{ join_code: HouseholdJoinCode }> {
  assertOwner(identity);
  const code = generateJoinCode();
  const codeHash = await hashJoinCode(code, env);
  const { createdAt, expiresAt } = joinCodeDates(now);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE household_join_codes
       SET revoked_at = ?
       WHERE household_id = ? AND revoked_at IS NULL`,
    ).bind(createdAt, identity.householdId),
    env.DB.prepare(
      `INSERT INTO household_join_codes (
        id, household_id, code_hash, created_by_user_id,
        expires_at, revoked_at, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    ).bind(
      crypto.randomUUID(),
      identity.householdId,
      codeHash,
      identity.user.id,
      expiresAt,
      createdAt,
    ),
  ]);

  return { join_code: { code, expires_at: expiresAt } };
}

export async function revokeHouseholdJoinCodes(
  env: HouseholdEnvironment,
  identity: RequestIdentity,
  now = new Date(),
): Promise<{ success: true }> {
  assertOwner(identity);
  await env.DB.prepare(
    `UPDATE household_join_codes
     SET revoked_at = ?
     WHERE household_id = ? AND revoked_at IS NULL`,
  ).bind(now.toISOString(), identity.householdId).run();
  return { success: true };
}
