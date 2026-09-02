import { createHmac } from "node:crypto";

export interface AppTokenIdentity {
  googleSubject: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function issueAppToken(
  identity: AppTokenIdentity,
  options: {
    secret: string;
    issuer: string;
    audience: string;
    now?: Date;
  },
): { token: string; expiresAt: string } {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 10 * 60;
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: identity.googleSubject,
    email: identity.email,
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.picture ? { picture: identity.picture } : {}),
    iss: options.issuer,
    aud: options.audience,
    iat: issuedAt,
    exp: expiresAt,
  });
  const input = `${header}.${payload}`;
  const signature = createHmac("sha256", options.secret)
    .update(input)
    .digest("base64url");

  return {
    token: `${input}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
