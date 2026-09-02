import { describe, expect, it } from "vitest";
import { issueAppToken } from "../lib/app-token";

describe("app token issuance", () => {
  it("issues a ten-minute token accepted by the Worker verifier", async () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const issued = issueAppToken(
      {
        googleSubject: "google-subject-1",
        email: "jiwoo@example.com",
        name: "Jiwoo",
        picture: "https://example.com/avatar.png",
      },
      {
        secret: "shared-test-secret",
        issuer: "jangoing-web",
        audience: "jangoing-api",
        now,
      },
    );

    const [encodedHeader, encodedPayload, encodedSignature] =
      issued.token.split(".");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("shared-test-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      new Uint8Array(Buffer.from(encodedSignature, "base64url")),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const claims = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(verified).toBe(true);
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(claims).toMatchObject({
      sub: "google-subject-1",
      email: "jiwoo@example.com",
      name: "Jiwoo",
      picture: "https://example.com/avatar.png",
      iss: "jangoing-web",
      aud: "jangoing-api",
      iat: 1_788_350_400,
      exp: 1_788_351_000,
    });
    expect(issued.expiresAt).toBe("2026-09-02T12:10:00.000Z");
  });

  it("does not include absent optional profile claims", () => {
    const { token } = issueAppToken(
      {
        googleSubject: "google-subject-1",
        email: "jiwoo@example.com",
      },
      {
        secret: "shared-test-secret",
        issuer: "jangoing-web",
        audience: "jangoing-api",
        now: new Date("2026-09-02T12:00:00.000Z"),
      },
    );
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("picture");
  });
});
