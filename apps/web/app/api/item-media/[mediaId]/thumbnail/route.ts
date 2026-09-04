import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { auth } from "../../../../../auth";
import { issueAppToken } from "../../../../../lib/app-token";

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

function apiBaseUrl(request: NextRequest): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (configuredBaseUrl) return configuredBaseUrl;

  const { protocol, hostname, port } = request.nextUrl;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8787";
  }
  if (protocol === "https:" && port === "" && hostname.includes("--3000.")) {
    return `https://${hostname.replace("--3000.", "--8787.")}`;
  }

  return "http://localhost:8787";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Authentication required", { status: 401 });
  }

  const config = configuration();
  if (!config) {
    return new Response("App token issuance is not configured", { status: 503 });
  }

  const authToken = await getToken({
    req: request,
    secret: config.authSecret,
    secureCookie: process.env.NODE_ENV === "production",
  });
  const googleSubject = authToken?.googleSubject;
  if (typeof googleSubject !== "string" || !googleSubject) {
    return new Response("Google identity is unavailable", { status: 401 });
  }

  const { mediaId } = await context.params;
  if (!mediaId?.trim()) {
    return new Response("Invalid media id", { status: 400 });
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

  const upstreamUrl = new URL(
    `/item-media/${encodeURIComponent(mediaId.trim())}/thumbnail`,
    apiBaseUrl(request),
  );
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${issued.token}`,
      ...(request.headers.get("If-None-Match")
        ? { "If-None-Match": request.headers.get("If-None-Match")! }
        : {}),
      ...(request.headers.get("If-Modified-Since")
        ? { "If-Modified-Since": request.headers.get("If-Modified-Since")! }
        : {}),
    },
    cache: "no-store",
  });

  const headers = new Headers();
  for (const key of [
    "Content-Type",
    "Content-Length",
    "ETag",
    "Last-Modified",
  ]) {
    const value = upstreamResponse.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("Cache-Control", "private, max-age=31536000, immutable");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}
