import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdJoinCode,
  revokeHouseholdJoinCode,
} from "../lib/api";

describe("household invite API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates and validates a household join code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          join_code: {
            code: "ABCD-EFGH-JK",
            expires_at: "2026-09-09T12:00:00.000Z",
          },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createHouseholdJoinCode()).resolves.toEqual({
      code: "ABCD-EFGH-JK",
      expires_at: "2026-09-09T12:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/households/join-code",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("revokes active household join codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ success: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeHouseholdJoinCode()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/households/join-code/revoke",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
