export interface AuthEnvironment {
  DB: D1Database;
  AUTH_REQUIRED?: string;
  APP_JWT_SECRET?: string;
  APP_JWT_ISSUER?: string;
  APP_JWT_AUDIENCE?: string;
}

export interface AppJwtClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  googleSubject: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RequestIdentity {
  user: AuthenticatedUser;
  householdId: string | null;
  role: "owner" | "member" | null;
}

interface UserRow {
  id: string;
  google_subject: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface MembershipRow {
  household_id: string;
  role: "owner" | "member";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const maximumTokenLifetimeSeconds = 15 * 60;
const issuedAtClockSkewSeconds = 30;

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }
}

function parseJsonPart(value: string): unknown {
  try {
    return JSON.parse(decoder.decode(decodeBase64Url(value)));
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredConfig(
  env: AuthEnvironment,
): { secret: string; issuer: string; audience: string } {
  const secret = env.APP_JWT_SECRET?.trim();
  const issuer = env.APP_JWT_ISSUER?.trim();
  const audience = env.APP_JWT_AUDIENCE?.trim();

  if (!secret || !issuer || !audience) {
    throw new AuthError(
      503,
      "authentication_not_configured",
      "Authentication is not configured",
    );
  }

  return { secret, issuer, audience };
}

function parseClaims(
  value: unknown,
  issuer: string,
  audience: string,
  nowSeconds: number,
): AppJwtClaims {
  if (!isObject(value)) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  const {
    sub,
    email,
    name,
    picture,
    iss,
    aud,
    iat,
    exp,
  } = value;
  const audiences =
    typeof aud === "string"
      ? [aud]
      : Array.isArray(aud) && aud.every((entry) => typeof entry === "string")
        ? aud
        : [];

  if (
    typeof sub !== "string" ||
    !sub.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    typeof iss !== "string" ||
    iss !== issuer ||
    !audiences.includes(audience) ||
    typeof iat !== "number" ||
    !Number.isInteger(iat) ||
    typeof exp !== "number" ||
    !Number.isInteger(exp) ||
    exp <= iat ||
    exp - iat > maximumTokenLifetimeSeconds ||
    iat > nowSeconds + issuedAtClockSkewSeconds ||
    exp <= nowSeconds ||
    (name !== undefined && typeof name !== "string") ||
    (picture !== undefined && typeof picture !== "string")
  ) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  return {
    sub: sub.trim(),
    email: email.trim(),
    name: name?.trim() || undefined,
    picture: picture?.trim() || undefined,
    iss,
    aud: aud as string | string[],
    iat,
    exp,
  };
}

export async function verifyAppJwt(
  token: string,
  env: AuthEnvironment,
  now = new Date(),
): Promise<AppJwtClaims> {
  if (token.length > 8192) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart(encodedHeader);
  if (
    !isObject(header) ||
    header.alg !== "HS256" ||
    (header.typ !== undefined && header.typ !== "JWT")
  ) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  const { secret, issuer, audience } = requiredConfig(env);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = new Uint8Array(decodeBase64Url(encodedSignature));
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!verified) {
    throw new AuthError(401, "invalid_token", "Invalid authentication token");
  }

  return parseClaims(
    parseJsonPart(encodedPayload),
    issuer,
    audience,
    Math.floor(now.getTime() / 1000),
  );
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    throw new AuthError(
      401,
      "invalid_authorization",
      "Invalid Authorization header",
    );
  }

  return match[1];
}

export function isAuthRequired(env: AuthEnvironment): boolean {
  return env.AUTH_REQUIRED?.trim().toLowerCase() === "true";
}

export function isConsumerPath(pathname: string): boolean {
  return (
    pathname === "/commands/interpret" ||
    pathname === "/inferences/outcome" ||
    pathname === "/events" ||
    pathname === "/inventory" ||
    pathname.startsWith("/inventory/") ||
    pathname === "/shopping-list" ||
    pathname.startsWith("/shopping-list/") ||
    pathname === "/fridge-setup" ||
    pathname.startsWith("/fridge-setup/")
  );
}

async function upsertUser(
  env: AuthEnvironment,
  claims: AppJwtClaims,
): Promise<AuthenticatedUser> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO users (
      id, google_subject, email, display_name, avatar_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_subject) DO UPDATE SET
      email = excluded.email,
      display_name = COALESCE(excluded.display_name, users.display_name),
      avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
      updated_at = excluded.updated_at
    RETURNING id, google_subject, email, display_name, avatar_url`,
  ).bind(
    crypto.randomUUID(),
    claims.sub,
    claims.email,
    claims.name ?? null,
    claims.picture ?? null,
    now,
    now,
  ).first<UserRow>();

  if (!row) {
    throw new AuthError(500, "identity_resolution_failed", "Unable to resolve identity");
  }

  return {
    id: row.id,
    googleSubject: row.google_subject,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

async function resolveMembership(
  env: AuthEnvironment,
  userId: string,
): Promise<MembershipRow | null> {
  const result = await env.DB.prepare(
    `SELECT household_id, role
     FROM household_memberships
     WHERE user_id = ?
     ORDER BY created_at ASC, household_id ASC
     LIMIT 2`,
  ).bind(userId).all<MembershipRow>();

  if (result.results.length > 1) {
    throw new AuthError(
      500,
      "multiple_households_not_supported",
      "Multiple household memberships are not supported",
    );
  }

  return result.results[0] ?? null;
}

export async function authenticateConsumerRequest(
  request: Request,
  env: AuthEnvironment,
): Promise<RequestIdentity | null> {
  const required = isAuthRequired(env);
  const token = bearerToken(request);

  if (!token) {
    if (required) {
      throw new AuthError(401, "authentication_required", "Authentication required");
    }
    return null;
  }

  const claims = await verifyAppJwt(token, env);
  const user = await upsertUser(env, claims);
  const membership = await resolveMembership(env, user.id);

  if (required && !membership) {
    throw new AuthError(
      409,
      "household_required",
      "Household setup is required",
    );
  }

  return {
    user,
    householdId: membership?.household_id ?? null,
    role: membership?.role ?? null,
  };
}
