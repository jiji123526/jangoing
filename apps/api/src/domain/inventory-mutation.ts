import type { EventType } from "@jangoing/contracts";

export function inventoryMutationEventType(
  action: "edit" | "remove",
  _quantity: number | null,
): Extract<EventType, "item_adjusted" | "item_removed"> {
  return action === "remove" ? "item_removed" : "item_adjusted";
}
