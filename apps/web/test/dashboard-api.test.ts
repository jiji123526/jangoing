import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("dashboard API client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("attaches an app token to dashboard requests", async () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "http:",
        hostname: "localhost",
        port: "3000",
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          token: "app-token",
          expires_at: "2099-01-01T00:10:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          inventory: [],
          events: [],
          shopping_list: [],
          fridge_setup: {
            completed: false,
            completed_at: null,
          },
          acknowledged_attention_items: [],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getDashboardData } = await import("../lib/api");

    await expect(getDashboardData()).resolves.toEqual({
      dashboard: {
        inventory: [],
        events: [],
        shoppingList: [],
      },
      fridgeSetupStatus: {
        completed: false,
        completed_at: null,
      },
      acknowledgedAttentionItems: [],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/app-token",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );

    const dashboardRequest = fetchMock.mock.calls[1];
    expect(dashboardRequest?.[0]).toBe("http://localhost:8787/dashboard");
    const headers = dashboardRequest?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Bearer app-token");
  });
});
