import type { EventType } from "@jangoing/contracts";

export function inventoryMutationEventType(
  action: "edit" | "remove",
  quantity: number | null,
): Extract<EventType, "item_adjusted" | "item_removed"> {
  return action === "remove" || quantity === 0
    ? "item_removed"
    : "item_adjusted";
}
