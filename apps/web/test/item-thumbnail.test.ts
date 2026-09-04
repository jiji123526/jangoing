import { describe, expect, it } from "vitest";
import { defaultSquareThumbnailCrop } from "../lib/item-thumbnail";

describe("defaultSquareThumbnailCrop", () => {
  it("centers a landscape image into a square crop", () => {
    expect(defaultSquareThumbnailCrop(1200, 800)).toEqual({
      x: 200,
      y: 0,
      size: 800,
    });
  });

  it("centers a portrait image into a square crop", () => {
    expect(defaultSquareThumbnailCrop(800, 1200)).toEqual({
      x: 0,
      y: 200,
      size: 800,
    });
  });

  it("returns the full image when already square", () => {
    expect(defaultSquareThumbnailCrop(640, 640)).toEqual({
      x: 0,
      y: 0,
      size: 640,
    });
  });
});
