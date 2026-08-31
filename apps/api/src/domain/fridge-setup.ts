import type {
  EventRecord,
  FridgeSetupItem,
  InventoryItem,
} from "@jangoing/contracts";

export const fridgeSetupCompletedKey = "fridge_setup_completed_at";

export function buildFridgeSetupEvents(
  items: FridgeSetupItem[],
  inventory: InventoryItem[],
  completedAt: string,
  createId: () => string = () => crypto.randomUUID(),
): EventRecord[] {
  const existingItems = new Set(inventory.map((item) => item.item_name));

  return items.map((item) => ({
    id: createId(),
    event_type: existingItems.has(item.item_name)
      ? "item_adjusted"
      : "item_added",
    item_name: item.item_name,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    expiration_date: item.expiration_date,
    low_threshold: item.low_threshold,
    raw_utterance: `Initial fridge setup: ${item.item_name}`,
    confidence: 1,
    source: "fridge_setup",
    created_at: completedAt,
  }));
}
