import { describe, expect, it } from "vitest";
import {
  legacySearchHistoryStorageKey,
  searchHistoryStorageKey,
} from "../lib/search-history";

describe("search history storage", () => {
  it("uses a separate local key for each authenticated user", () => {
    const first = searchHistoryStorageKey(
      "11111111-1111-4111-8111-111111111111",
    );
    const second = searchHistoryStorageKey(
      "22222222-2222-4222-8222-222222222222",
    );

    expect(first).toBe(
      "jangoing-recent-searches:11111111-1111-4111-8111-111111111111",
    );
    expect(first).not.toBe(second);
    expect(first).not.toBe(legacySearchHistoryStorageKey);
  });
});
