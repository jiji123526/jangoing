import type { InventoryItem } from "@jangoing/contracts";

export function inventoryNeedsAttention(item: InventoryItem): boolean {
  return (
    item.status === "low" ||
    item.status === "out" ||
    item.expiry_state === "expired" ||
    item.expiry_state === "expiring_soon"
  );
}

export function inventoryAttentionSnapshot(item: InventoryItem): string {
  return JSON.stringify({
    quantity: item.quantity,
    status: item.status,
    nearest_expiration_date: item.nearest_expiration_date,
    expiry_state: item.expiry_state,
  });
}
