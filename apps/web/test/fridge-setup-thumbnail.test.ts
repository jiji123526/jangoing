import type { InventoryItem } from "@jangoing/contracts";
import { describe, expect, it } from "vitest";
import {
  applyUploadedThumbnails,
  setupThumbnailUploads,
} from "../lib/fridge-setup-thumbnail";

describe("fridge setup thumbnail helpers", () => {
  it("collects upload payloads only for named drafts with photos", () => {
    expect(
      setupThumbnailUploads([
        { name: "Oat Milk", thumbnailUrl: "data:image/jpeg;base64,AAAA" },
        { name: "  ", thumbnailUrl: "data:image/jpeg;base64,BBBB" },
        { name: "Eggs", thumbnailUrl: "" },
      ]),
    ).toEqual([
      {
        itemName: "oat_milk",
        thumbnailUrl: "data:image/jpeg;base64,AAAA",
      },
    ]);
  });

  it("applies uploaded thumbnail responses back onto projected inventory", () => {
    const inventory: InventoryItem[] = [
      {
        item_name: "oat_milk",
        category: null,
        thumbnail_url: null,
        added_at: "2026-09-04T12:00:00.000Z",
        quantity: 1,
        unit: "carton",
        location: "fridge",
        status: "in_stock",
        low_threshold: null,
        low_threshold_unit: null,
        nearest_expiration_date: null,
        expiry_state: "unknown",
      },
      {
        item_name: "eggs",
        category: null,
        thumbnail_url: null,
        added_at: "2026-09-04T12:00:00.000Z",
        quantity: 12,
        unit: "piece",
        location: "fridge",
        status: "in_stock",
        low_threshold: null,
        low_threshold_unit: null,
        nearest_expiration_date: null,
        expiry_state: "unknown",
      },
    ];

    expect(
      applyUploadedThumbnails(inventory, [
        {
          item_name: "oat_milk",
          thumbnail_url: "data:image/jpeg;base64,AAAA",
          updated_at: "2026-09-04T12:01:00.000Z",
        },
      ]),
    ).toMatchObject([
      {
        item_name: "oat_milk",
        thumbnail_url: "data:image/jpeg;base64,AAAA",
      },
      {
        item_name: "eggs",
        thumbnail_url: null,
      },
    ]);
  });
});
