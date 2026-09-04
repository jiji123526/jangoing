import type { InventoryItem } from "@jangoing/contracts";

export type InventoryItemUpdate = {
  quantity: number;
  unit: string | null;
  location: InventoryItem["location"];
  expiration_date: string | null;
  low_threshold: number | null;
  category: InventoryItem["category"];
};

function normalizedString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizedLocation(
  value: InventoryItem["location"] | "" | null | undefined,
): InventoryItem["location"] | null {
  return value === "fridge" || value === "freezer" || value === "pantry"
    ? value
    : null;
}

export function hasInventoryItemChanges(
  item: InventoryItem,
  update: InventoryItemUpdate,
): boolean {
  return !(
    item.quantity === update.quantity &&
    normalizedString(item.unit) === normalizedString(update.unit) &&
    normalizedLocation(item.location) === normalizedLocation(update.location) &&
    (item.nearest_expiration_date ?? null) === (update.expiration_date ?? null) &&
    (item.low_threshold ?? null) === (update.low_threshold ?? null) &&
    (item.category ?? null) === (update.category ?? null)
  );
}
