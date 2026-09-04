import type {
  InventoryItem,
  ItemThumbnailResponse,
} from "@jangoing/contracts";

export interface FridgeSetupThumbnailDraft {
  name: string;
  thumbnailUrl: string;
}

function canonicalItemName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function setupThumbnailUploads(
  drafts: FridgeSetupThumbnailDraft[],
): Array<{ itemName: string; thumbnailUrl: string }> {
  return drafts.flatMap((draft) => {
    const itemName = canonicalItemName(draft.name);
    if (!itemName || !draft.thumbnailUrl) return [];
    return [{
      itemName,
      thumbnailUrl: draft.thumbnailUrl,
    }];
  });
}

export function applyUploadedThumbnails(
  inventory: InventoryItem[],
  uploaded: ItemThumbnailResponse[],
): InventoryItem[] {
  const byItemName = new Map(
    uploaded
      .filter((item) => item.thumbnail_url)
      .map((item) => [item.item_name, item.thumbnail_url]),
  );

  return inventory.map((item) =>
    byItemName.has(item.item_name)
      ? {
          ...item,
          thumbnail_url: byItemName.get(item.item_name) ?? null,
        }
      : item,
  );
}
