import { describe, expect, it } from "vitest";
import {
  clampSquareThumbnailCrop,
  defaultSquareThumbnailCrop,
  squareThumbnailCropZoom,
  updateSquareThumbnailCropZoom,
} from "../lib/item-thumbnail";

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

describe("clampSquareThumbnailCrop", () => {
  it("keeps the crop inside the image bounds", () => {
    expect(
      clampSquareThumbnailCrop(1000, 700, {
        x: 900,
        y: -40,
        size: 1200,
      }),
    ).toEqual({
      x: 300,
      y: 0,
      size: 700,
    });
  });
});

describe("updateSquareThumbnailCropZoom", () => {
  it("zooms around the current crop center", () => {
    const next = updateSquareThumbnailCropZoom(
      1200,
      800,
      defaultSquareThumbnailCrop(1200, 800),
      2,
    );

    expect(next).toEqual({
      x: 400,
      y: 200,
      size: 400,
    });
  });
});

describe("squareThumbnailCropZoom", () => {
  it("returns the zoom represented by a crop", () => {
    expect(
      squareThumbnailCropZoom(1200, 800, {
        x: 400,
        y: 200,
        size: 400,
      }),
    ).toBe(2);
  });
});
