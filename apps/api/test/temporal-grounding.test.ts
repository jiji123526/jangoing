import { describe, expect, it } from "vitest";
import {
  normalizeExpiryDate,
  resolveTemporalGrounding,
} from "../src/nlp/temporal-grounding";

describe("temporal grounding", () => {
  it("normalizes tomorrow from the stored reference date", () => {
    expect(normalizeExpiryDate("tomorrow", {
      reference_date: "2026-08-27",
      timezone: "America/Los_Angeles",
    })).toBe("2026-08-28");
  });

  it("normalizes next Friday deterministically", () => {
    expect(normalizeExpiryDate("next Friday", {
      reference_date: "2026-08-26",
      timezone: "UTC",
    })).toBe("2026-09-04");
  });

  it("keeps an explicit reference date when processing happens later", () => {
    expect(resolveTemporalGrounding(
      {
        reference_date: "2026-08-27",
        timezone: "America/Los_Angeles",
      },
      new Date("2026-08-30T18:00:00Z"),
    )).toEqual({
      reference_date: "2026-08-27",
      timezone: "America/Los_Angeles",
    });
  });

  it("derives the local reference date at timezone boundaries", () => {
    const now = new Date("2026-08-28T06:30:00Z");

    expect(resolveTemporalGrounding({
      timezone: "America/Los_Angeles",
    }, now).reference_date).toBe("2026-08-27");
    expect(resolveTemporalGrounding({
      timezone: "UTC",
    }, now).reference_date).toBe("2026-08-28");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(resolveTemporalGrounding(
      { timezone: "Not/A_Timezone" },
      new Date("2026-08-28T06:30:00Z"),
    )).toEqual({
      reference_date: "2026-08-28",
      timezone: "UTC",
    });
  });

  it("returns undefined for text that is not a date", () => {
    expect(normalizeExpiryDate("sometime when convenient", {
      reference_date: "2026-08-27",
      timezone: "UTC",
    })).toBeUndefined();
  });
});
