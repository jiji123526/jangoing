import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHouseholdJoinCode,
  getHouseholdMembers,
  removeItemThumbnail,
  removeHouseholdMember,
  revokeHouseholdJoinCode,
  uploadItemThumbnail,
  updateHouseholdProfile,
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

  it("loads household members and removes a selected member", async () => {
    const memberId = "199ccf98-87b7-4387-b55d-f6fe8f070235";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          members: [
            {
              id: memberId,
              email: "member@example.com",
              display_name: "Member",
              avatar_url: null,
              role: "member",
              joined_at: "2026-09-02T12:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          removed_user_id: memberId,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHouseholdMembers()).resolves.toHaveLength(1);
    await expect(removeHouseholdMember(memberId)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `http://localhost:8787/households/members/${memberId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("updates and validates the shared household profile", async () => {
    const household = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Shared Kitchen",
      profile_emoji: "🥑",
      icon_color: "#336699",
      role: "owner",
      created_at: "2026-09-02T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ household }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateHouseholdProfile({
        name: household.name,
        profile_emoji: household.profile_emoji,
        icon_color: household.icon_color,
      }),
    ).resolves.toEqual(household);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/households/current",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("uploads and removes a primary item thumbnail", async () => {
    const thumbnailUrl = "data:image/jpeg;base64,QUJDRA==";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          item_name: "milk",
          thumbnail_url: thumbnailUrl,
          updated_at: "2026-09-04T12:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          item_name: "milk",
          thumbnail_url: null,
          updated_at: "2026-09-04T12:01:00.000Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadItemThumbnail("milk", thumbnailUrl)).resolves.toEqual({
      item_name: "milk",
      thumbnail_url: thumbnailUrl,
      updated_at: "2026-09-04T12:00:00.000Z",
    });
    await expect(removeItemThumbnail("milk")).resolves.toEqual({
      item_name: "milk",
      thumbnail_url: null,
      updated_at: "2026-09-04T12:01:00.000Z",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8787/items/milk/media",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8787/items/milk/media",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
