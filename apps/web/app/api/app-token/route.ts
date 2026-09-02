import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { auth } from "../../../auth";
import { issueAppToken } from "../../../lib/app-token";

export const runtime = "nodejs";

function configuration(): {
  authSecret: string;
  appSecret: string;
  issuer: string;
  audience: string;
} | null {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const appSecret = process.env.APP_JWT_SECRET?.trim();
  const issuer = process.env.APP_JWT_ISSUER?.trim();
  const audience = process.env.APP_JWT_AUDIENCE?.trim();
  return authSecret && appSecret && issuer && audience
    ? { authSecret, appSecret, issuer, audience }
    : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const config = configuration();
  if (!config) {
    return Response.json(
      { error: "App token issuance is not configured" },
      { status: 503 },
    );
  }

  const authToken = await getToken({
    req: request,
    secret: config.authSecret,
    secureCookie: process.env.NODE_ENV === "production",
  });
  const googleSubject = authToken?.googleSubject;
  if (typeof googleSubject !== "string" || !googleSubject) {
    return Response.json(
      { error: "Google identity is unavailable" },
      { status: 401 },
    );
  }

  const issued = issueAppToken(
    {
      googleSubject,
      email: session.user.email,
      name: session.user.name,
      picture: session.user.image,
    },
    {
      secret: config.appSecret,
      issuer: config.issuer,
      audience: config.audience,
    },
  );

  return Response.json(
    {
      token: issued.token,
      expires_at: issued.expiresAt,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
