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
  sourcePurchaseId: string | null;
  forcedStatusBeforePurchase: InventoryItem["status"] | null;
}

interface ItemState {
  batches: Batch[];
  forcedStatus: InventoryItem["status"] | null;
  lowThreshold: number | null;
  lowThresholdUnit: string | null;
  visible: boolean;
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

    if (event.event_type === "item_removed") {
      states.delete(event.item_name);
      continue;
    }

    const state = states.get(event.item_name) ?? {
      batches: [],
      forcedStatus: null,
      lowThreshold: null,
      lowThresholdUnit: null,
      visible: false,
    };

    if (event.event_type === "shopping_item_purchased") {
      // Legacy purchase events had no context and must not retroactively add stock.
      if (event.quantity === null || event.quantity === undefined) {
        continue;
      }
      state.batches.push({
        quantity: event.quantity,
        unit: event.unit ?? null,
        location: event.location ?? "fridge",
        expirationDate: event.expiration_date ?? null,
        sourcePurchaseId: event.id,
        forcedStatusBeforePurchase: state.forcedStatus,
      });
      state.forcedStatus = null;
      states.set(event.item_name, state);
      continue;
    }

    if (event.event_type === "shopping_item_restored") {
      let purchaseBatchIndex = -1;
      for (let index = state.batches.length - 1; index >= 0; index -= 1) {
        if (state.batches[index].sourcePurchaseId !== null) {
          purchaseBatchIndex = index;
          break;
        }
      }
      if (purchaseBatchIndex >= 0) {
        const [purchaseBatch] = state.batches.splice(purchaseBatchIndex, 1);
        state.forcedStatus = purchaseBatch.forcedStatusBeforePurchase;
      }
      states.set(event.item_name, state);
      continue;
    }

    if (event.event_type === "item_low_threshold_set") {
      state.lowThreshold = event.low_threshold ?? null;
      state.lowThresholdUnit =
        event.unit ?? state.batches[0]?.unit ?? null;
      state.forcedStatus = null;
    } else {
      state.visible = true;
    }

    if (event.event_type === "item_adjusted") {
      const previousQuantity = state.batches.reduce(
        (total, batch) => total + batch.quantity,
        0,
      );
      const nextQuantity = event.quantity ?? 1;
      const nextLowThreshold = event.low_threshold ?? null;
      const inventoryLevelChanged =
        previousQuantity !== nextQuantity ||
        state.lowThreshold !== nextLowThreshold;

      state.batches = [{
        quantity: nextQuantity,
        unit: event.unit ?? null,
        location: event.location ?? null,
        expirationDate: event.expiration_date ?? null,
        sourcePurchaseId: null,
        forcedStatusBeforePurchase: null,
      }];
      state.lowThreshold = nextLowThreshold;
      state.lowThresholdUnit =
        nextLowThreshold === null ? null : event.unit ?? null;
      if (inventoryLevelChanged) {
        state.forcedStatus = null;
      }
    }

    if (event.event_type === "item_added") {
      state.batches.push({
        quantity: event.quantity ?? 1,
        unit: event.unit ?? null,
        location: event.location ?? "fridge",
        expirationDate: event.expiration_date ?? null,
        sourcePurchaseId: null,
        forcedStatusBeforePurchase: null,
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

    if (event.event_type === "item_marked_out") {
      state.batches = [];
      state.forcedStatus = "out";
    }

    if (event.event_type === "item_thrown_away") {
      state.batches = [];
      state.forcedStatus = "out";
    }

    states.set(event.item_name, state);
  }

  return [...states.entries()]
    .filter(([, state]) =>
      state.visible ||
      state.batches.some((batch) => batch.sourcePurchaseId !== null),
    )
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
      const thresholdUnitMatches =
        state.lowThresholdUnit === null ||
        state.lowThresholdUnit === firstBatch?.unit;

      return {
        item_name: itemName,
        quantity,
        unit: firstBatch?.unit ?? null,
        location: firstBatch?.location ?? null,
        status:
          state.forcedStatus ??
          (quantity <= 0
            ? "out"
            : state.lowThreshold !== null &&
                thresholdUnitMatches &&
                quantity <= state.lowThreshold
              ? "low"
              : "in_stock"),
        low_threshold: state.lowThreshold,
        low_threshold_unit: state.lowThresholdUnit,
        nearest_expiration_date: nearestExpirationDate,
        expiry_state: expiryState(nearestExpirationDate, today),
      };
    })
    .sort((left, right) => left.item_name.localeCompare(right.item_name));
}

export function projectShoppingList(
  events: EventRecord[],
  now = new Date(),
  purchasedRetentionMs = 24 * 60 * 60 * 1000,
): ShoppingListItem[] {
  const items = new Map<string, ShoppingListItem>();

  for (const event of events) {
    if (event.event_type === "item_added_to_buy") {
      items.set(event.item_name, {
        item_name: event.item_name,
        added_at: event.created_at,
        status: "active",
        purchased_at: null,
        quantity: event.quantity ?? 1,
        unit: event.unit ?? null,
        location: event.location ?? null,
        expiration_date: event.expiration_date ?? null,
      });
    }

    const item = items.get(event.item_name);
    if (!item) continue;

    if (event.event_type === "shopping_item_purchased") {
      item.status = "purchased";
      item.purchased_at = event.created_at;
    }

    if (event.event_type === "shopping_item_restored") {
      item.status = "active";
      item.purchased_at = null;
    }
  }

  const cutoff = now.getTime() - purchasedRetentionMs;

  return [...items.values()]
    .filter((item) =>
      item.status === "active" ||
      (item.purchased_at !== null &&
        Date.parse(item.purchased_at) >= cutoff),
    )
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }
      const leftTimestamp = left.purchased_at ?? left.added_at;
      const rightTimestamp = right.purchased_at ?? right.added_at;
      return rightTimestamp.localeCompare(leftTimestamp);
    });
}
