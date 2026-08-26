import type {
  EventRecord,
  InventoryItem,
  ShoppingListItem,
} from "@jangoing/contracts";

interface Batch {
  quantity: number;
  unit: string | null;
  location: InventoryItem["location"];
  expirationDate: string | null;
}

interface ItemState {
  batches: Batch[];
  forcedStatus: InventoryItem["status"] | null;
}

function dateAtUtcMidnight(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function expiryState(
  expirationDate: string | null,
  today: Date,
): InventoryItem["expiry_state"] {
  if (!expirationDate) {
    return "unknown";
  }

  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const daysRemaining =
    (dateAtUtcMidnight(expirationDate) - todayUtc) / 86_400_000;

  if (daysRemaining < 0) {
    return "expired";
  }

  return daysRemaining <= 3 ? "expiring_soon" : "fresh";
}

function consumeBatches(batches: Batch[], requestedQuantity: number): void {
  let remaining = requestedQuantity;

  batches.sort((left, right) => {
    if (!left.expirationDate) return 1;
    if (!right.expirationDate) return -1;
    return left.expirationDate.localeCompare(right.expirationDate);
  });

  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = Math.min(batch.quantity, remaining);
    batch.quantity -= used;
    remaining -= used;
  }

  for (let index = batches.length - 1; index >= 0; index -= 1) {
    if (batches[index].quantity <= 0) {
      batches.splice(index, 1);
    }
  }
}

export function projectInventory(
  events: EventRecord[],
  today = new Date(),
): InventoryItem[] {
  const states = new Map<string, ItemState>();

  for (const event of events) {
    if (event.event_type === "item_added_to_buy") {
      continue;
    }

    const state = states.get(event.item_name) ?? {
      batches: [],
      forcedStatus: null,
    };

    if (event.event_type === "item_added") {
      state.batches.push({
        quantity: event.quantity ?? 1,
        unit: event.unit ?? null,
        location: event.location ?? "fridge",
        expirationDate: event.expiration_date ?? null,
      });
      state.forcedStatus = null;
    }

    if (event.event_type === "item_consumed") {
      consumeBatches(state.batches, event.quantity ?? 1);
      state.forcedStatus = state.batches.length === 0 ? "out" : null;
    }

    if (event.event_type === "item_marked_low") {
      state.forcedStatus = "low";
    }

    if (event.event_type === "item_thrown_away") {
      state.batches = [];
      state.forcedStatus = "out";
    }

    states.set(event.item_name, state);
  }

  return [...states.entries()]
    .map(([itemName, state]): InventoryItem => {
      const quantity = state.batches.reduce(
        (total, batch) => total + batch.quantity,
        0,
      );
      const expirations = state.batches
        .map((batch) => batch.expirationDate)
        .filter((date): date is string => Boolean(date))
        .sort();
      const nearestExpirationDate = expirations[0] ?? null;
      const firstBatch = state.batches[0];

      return {
        item_name: itemName,
        quantity,
        unit: firstBatch?.unit ?? null,
        location: firstBatch?.location ?? null,
        status:
          state.forcedStatus ?? (quantity > 0 ? "in_stock" : "out"),
        nearest_expiration_date: nearestExpirationDate,
        expiry_state: expiryState(nearestExpirationDate, today),
      };
    })
    .sort((left, right) => left.item_name.localeCompare(right.item_name));
}

export function projectShoppingList(
  events: EventRecord[],
): ShoppingListItem[] {
  const items = new Map<string, ShoppingListItem>();

  for (const event of events) {
    if (event.event_type === "item_added_to_buy") {
      items.set(event.item_name, {
        item_name: event.item_name,
        added_at: event.created_at,
      });
    }
  }

  return [...items.values()].sort((left, right) =>
    right.added_at.localeCompare(left.added_at),
  );
}
